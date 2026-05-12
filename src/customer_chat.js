/* Customer-facing chat with tool use.
 *
 * Lets the AI book appointments end-to-end from the chat — no separate modal,
 * no "the business will confirm shortly" handoff. Mirrors the shape of
 * admin_chat.js but with customer-safe tools.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { getBusiness } = require('./business');
const { getAvailableSlots, bookSlot } = require('./bookings');
const { db, recordAnthropicUsage, getBookingById } = require('./db');
const { estimateCost } = require('./config/claude');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_ITERATIONS = 5;
const MAX_BOOKINGS_PER_DAY = 3;

const TOOLS = [
  {
    name: 'list_services',
    description: 'List every service the business offers with its duration and price. Call this if the customer asks "what do you offer" or seems unsure which service they want.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'check_availability',
    description: 'Check open booking slots for a specific date and service. Call this BEFORE proposing times to the customer. Returns an array of slot times in HH:MM 24-hour format, OR a reason field if the business is closed that day.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        service: { type: 'string', description: 'Exact service name from list_services. Match is case-insensitive but the spelling must otherwise be exact.' },
      },
      required: ['date', 'service'],
    },
  },
  {
    name: 'book_appointment',
    description: 'Book a confirmed appointment in the calendar. Only call when you have collected: service, date, time, customer name, and at least one of phone/email. Email is preferred (a confirmation will be sent). The tool returns the booking on success or an error explaining why it failed.',
    input_schema: {
      type: 'object',
      properties: {
        service:  { type: 'string', description: 'Exact service name.' },
        date:     { type: 'string', description: 'YYYY-MM-DD.' },
        time:     { type: 'string', description: 'HH:MM in 24-hour local time.' },
        name:     { type: 'string', description: "Customer's full name." },
        phone:    { type: 'string', description: 'Customer phone number. Optional if email is provided.' },
        email:    { type: 'string', description: 'Customer email. Optional if phone is provided. Confirmation goes here.' },
        notes:    { type: 'string', description: 'Any extra context the customer mentioned (e.g. "first visit", "running 10 min late typically").' },
      },
      required: ['service', 'date', 'time', 'name'],
    },
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bookingsInLast24h(profileId) {
  if (!profileId) return 0;
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM bookings WHERE profile_id = ? AND created_at > datetime('now', '-1 day')`
  ).get(profileId);
  return row?.n ?? 0;
}

function caseInsensitiveServiceName(name) {
  const business = getBusiness();
  const lower = String(name || '').trim().toLowerCase();
  const match = (business.services || []).find(s => s.name.toLowerCase() === lower);
  return match ? match.name : name;
}

function executeTool(toolName, input, ctx) {
  if (toolName === 'list_services') {
    const services = (getBusiness().services || []).map(s => ({
      name: s.name,
      duration_minutes: s.duration_minutes,
      price: s.price,
    }));
    return { ok: true, services };
  }

  if (toolName === 'check_availability') {
    const date = String(input?.date || '').trim();
    const service = caseInsensitiveServiceName(input?.service);
    if (!date || !service) return { error: 'date and service are required.' };
    const result = getAvailableSlots(date, service);
    if (result.error) return { error: result.error };
    return { ok: true, date, service, slots: result.slots, reason: result.reason || null };
  }

  if (toolName === 'book_appointment') {
    const service = caseInsensitiveServiceName(input?.service);
    const date = String(input?.date || '').trim();
    const time = String(input?.time || '').trim();
    const name = String(input?.name || '').trim();
    const phone = input?.phone ? String(input.phone).trim() : null;
    const email = input?.email ? String(input.email).trim() : null;
    const notes = input?.notes ? String(input.notes).trim() : null;

    if (!service || !date || !time || !name) {
      return { error: 'Need service, date, time, and customer name to book.' };
    }
    if (!phone && !email) {
      return { error: 'Need at least one contact method — ask the customer for phone OR email.' };
    }
    if (email && !EMAIL_RE.test(email)) {
      return { error: `Email "${email}" looks malformed — confirm spelling with the customer.` };
    }

    if (bookingsInLast24h(ctx.profileId) >= MAX_BOOKINGS_PER_DAY) {
      return { error: `This customer has already made ${MAX_BOOKINGS_PER_DAY} bookings in the last 24 hours. Tell them to contact the business directly if they really need another.` };
    }

    const result = bookSlot({
      profileId: ctx.profileId,
      customerName: name,
      customerPhone: phone || '',
      customerEmail: email || null,
      serviceName: service,
      dateStr: date,
      time,
      notes,
      source: 'chat',
    });
    if (result.error) return { error: result.error };

    return {
      ok: true,
      booking: {
        id: result.booking.id,
        service_name: result.booking.service_name,
        starts_at: result.booking.starts_at,
        ends_at: result.booking.ends_at,
        duration_minutes: result.booking.duration_minutes,
        customer_name: result.booking.customer_name,
        confirmation_sent_to: email || null,
      },
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

function extractText(content) {
  return (content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim();
}

// Anthropic prompt caching: cumulative up to the LAST cache_control marker.
// We mark the big static prompt as ephemeral, then append a fresh "today"
// block that refreshes per call but doesn't bust the cache for everything
// before it. Without this, the AI doesn't know what "tomorrow" means and
// asks the customer to spell out YYYY-MM-DD — major friction.
function buildSystemWithToday(systemPrompt) {
  const today = new Date();
  const todayIso = today.toLocaleDateString('en-CA');
  const weekday  = today.toLocaleDateString('en-US', { weekday: 'long' });
  const todayBlock = {
    type: 'text',
    text: `TODAY IS: ${todayIso} (${weekday}). Interpret relative dates the customer mentions ("tomorrow", "this Friday", "next week") relative to today. When calling check_availability or book_appointment, always pass dates as YYYY-MM-DD.`,
  };
  if (typeof systemPrompt === 'string') {
    return [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      todayBlock,
    ];
  }
  if (Array.isArray(systemPrompt)) return [...systemPrompt, todayBlock];
  return systemPrompt;
}

/**
 * Runs the customer chat with tool use. Returns the final assistant reply
 * (concatenated text from the last non-tool-use turn), aggregated usage,
 * and a list of bookings that were created during the loop (for the UI to
 * render confirmation cards).
 *
 * @param {Array} initialMessages - History formatted for Anthropic Messages API.
 * @param {string|Array} systemPrompt - System prompt (string or pre-cached blocks).
 * @param {object} opts - { model, max_tokens, temperature, profileId }.
 */
async function runCustomerChat(initialMessages, systemPrompt, opts = {}) {
  const model = opts.model || 'claude-sonnet-4-6';
  const messages = [...initialMessages];
  const system = buildSystemWithToday(systemPrompt);
  const usageTotals = {
    model,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cost_usd: 0,
  };
  const bookingsCreated = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const params = {
      model,
      max_tokens: opts.max_tokens || 512,
      system,
      tools: TOOLS,
      messages,
    };
    if (Number.isFinite(opts.temperature)) params.temperature = opts.temperature;
    const response = await client.messages.create(params);

    const u = response.usage || {};
    usageTotals.input_tokens += u.input_tokens || 0;
    usageTotals.output_tokens += u.output_tokens || 0;
    usageTotals.cache_creation_tokens += u.cache_creation_input_tokens || 0;
    usageTotals.cache_read_tokens += u.cache_read_input_tokens || 0;
    usageTotals.cost_usd += estimateCost(model, u);

    if (response.stop_reason !== 'tool_use') {
      return {
        text: extractText(response.content) || '(no reply)',
        usage: usageTotals,
        bookingsCreated,
      };
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = executeTool(block.name, block.input, { profileId: opts.profileId });
      if (block.name === 'book_appointment' && result.ok && result.booking) {
        bookingsCreated.push(result.booking);
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: !!result.error,
      });
    }
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  // Hit the iteration cap — surface what the AI was working on.
  return {
    text: "I'm having trouble finishing that booking — could you call us directly?",
    usage: usageTotals,
    bookingsCreated,
  };
}

module.exports = { runCustomerChat, TOOLS, MAX_BOOKINGS_PER_DAY };
