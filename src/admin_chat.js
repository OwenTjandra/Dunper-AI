const Anthropic = require('@anthropic-ai/sdk');
const { getBusiness, applyBusinessUpdate } = require('./business');
const { recordAnthropicUsage } = require('./db');
const { estimateCost } = require('./config/claude');
const aiSettings = require('./ai_settings');

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 10;

const TOP_LEVEL_FIELDS = ['name', 'type', 'hours', 'address', 'phone', 'tone', 'fallback_contact'];

function hmToMin(hm) {
  if (!TIME_RE.test(String(hm))) return NaN;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function isValidLocalDate(dateStr) {
  if (!DATE_RE.test(String(dateStr))) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function cloneMessages(messages) {
  return messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.parse(JSON.stringify(m.content)),
  }));
}

const tools = [
  {
    name: 'get_business',
    description: 'Read the current business configuration. Use this if you need to verify the latest state after changes.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'update_business_field',
    description: 'Update one top-level string field of the business configuration.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: TOP_LEVEL_FIELDS,
          description: 'Which field to change.',
        },
        value: { type: 'string', description: 'The new value for the field.' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'add_service',
    description: 'Add a new service offering. Fails if a service with the same name already exists.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        duration_minutes: { type: 'integer', minimum: 1 },
        price: { type: 'string', description: 'Price as a free-form string, e.g. "Rp 350,000" or "Free for new patients".' },
      },
      required: ['name', 'duration_minutes', 'price'],
    },
  },
  {
    name: 'update_service',
    description: 'Update an existing service, found by its current name. Only the fields you supply are changed.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current name of the service to find.' },
        new_name: { type: 'string' },
        duration_minutes: { type: 'integer', minimum: 1 },
        price: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'remove_service',
    description: 'Remove a service by its name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'add_rule',
    description: 'Append a booking rule (free-text, one short sentence).',
    input_schema: {
      type: 'object',
      properties: { rule: { type: 'string' } },
      required: ['rule'],
    },
  },
  {
    name: 'remove_rule',
    description: 'Remove a booking rule by exact text match.',
    input_schema: {
      type: 'object',
      properties: { rule: { type: 'string' } },
      required: ['rule'],
    },
  },
  {
    name: 'set_weekly_hours',
    description: 'Set the open/close times for one or more days of the week. Use 24h "HH:MM" format. Pass closed=true to mark a day as closed (open/close still required but ignored). Days you omit are left unchanged.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          description: 'List of per-day entries to set.',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', enum: DAY_KEYS },
              open: { type: 'string', description: 'HH:MM 24h' },
              close: { type: 'string', description: 'HH:MM 24h' },
              closed: { type: 'boolean', description: 'true = business is closed this day' },
            },
            required: ['day'],
          },
        },
      },
      required: ['days'],
    },
  },
  {
    name: 'add_blocked_date',
    description: 'Add a specific date the business is closed (holiday, owner day off). Format: YYYY-MM-DD.',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'remove_blocked_date',
    description: 'Remove a previously-blocked date. Format: YYYY-MM-DD.',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'set_about',
    description: 'Replace the free-text "about" knowledge block with new content. Use for facts the AI should know that don\'t fit a service row (e.g. languages spoken, parking, payment methods).',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Plain text. Pass empty string to clear.' } },
      required: ['text'],
    },
  },
  {
    name: 'update_ai_setting',
    description: 'Update one AI parameter for the customer chatbot. Allowed keys: model, max_tokens, temperature, monthly_budget_usd, budget_action, tone, starter_message, fallback_message, auto_handoff_after_unresolved.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          enum: ['model', 'max_tokens', 'temperature', 'monthly_budget_usd', 'budget_action', 'tone', 'starter_message', 'fallback_message', 'auto_handoff_after_unresolved'],
        },
        value: {
          description: 'New value. Strings, numbers, or booleans depending on the key.',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_ai_settings',
    description: 'Read the current AI settings (model, budget, tone, etc.). Use this if you need to know the current state before changing it.',
    input_schema: { type: 'object', properties: {} },
  },
];

function findServiceIndex(business, name) {
  if (typeof name !== 'string') return -1;
  const lower = name.toLowerCase();
  return business.services.findIndex(s => s.name.toLowerCase() === lower);
}

function executeTool(toolName, input, user) {
  input = input && typeof input === 'object' ? input : {};
  const current = getBusiness();

  if (toolName === 'get_business') {
    return { ok: true, business: current };
  }

  if (toolName === 'get_ai_settings') {
    return { ok: true, ai_settings: aiSettings.getSettings() };
  }

  if (toolName === 'update_ai_setting') {
    if (typeof input.key !== 'string') return { error: 'key is required.' };
    const payload = { [input.key]: input.value };
    const r = aiSettings.saveSettings(payload, user?.id || null);
    if (r.error) return { error: r.error };
    return { ok: true, applied: `AI setting ${input.key} set to ${JSON.stringify(input.value)}` };
  }

  const next = JSON.parse(JSON.stringify(current));
  let note = '';

  if (toolName === 'update_business_field') {
    if (!TOP_LEVEL_FIELDS.includes(input.field)) {
      return { error: `Unknown field "${input.field}".` };
    }
    if (typeof input.value !== 'string' || !input.value.trim()) {
      return { error: 'Field value must be a non-empty string.' };
    }
    const previous = current[input.field];
    if (previous === input.value) {
      return { error: `${input.field} is already set to "${input.value}" — no change made.` };
    }
    next[input.field] = input.value;
    note = `Set ${input.field} to "${input.value}" (was "${previous}")`;
  } else if (toolName === 'add_service') {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      return { error: 'Service name is required.' };
    }
    if (!Number.isInteger(input.duration_minutes) || input.duration_minutes <= 0) {
      return { error: 'Service duration must be a positive integer.' };
    }
    if (typeof input.price !== 'string' || !input.price.trim()) {
      return { error: 'Service price is required.' };
    }
    if (findServiceIndex(next, input.name) !== -1) {
      return { error: `A service named "${input.name}" already exists.` };
    }
    next.services.push({
      name: input.name,
      duration_minutes: input.duration_minutes,
      price: input.price,
    });
    note = `Added service "${input.name}" (${input.duration_minutes} min, ${input.price})`;
  } else if (toolName === 'update_service') {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      return { error: 'Service name is required.' };
    }
    const idx = findServiceIndex(next, input.name);
    if (idx === -1) return { error: `No service named "${input.name}".` };
    const svc = next.services[idx];
    const changes = [];
    if (input.new_name !== undefined && input.new_name !== svc.name) {
      if (typeof input.new_name !== 'string' || !input.new_name.trim()) {
        return { error: 'New service name must be a non-empty string.' };
      }
      changes.push(`renamed to "${input.new_name}"`);
      svc.name = input.new_name;
    }
    if (input.duration_minutes !== undefined && input.duration_minutes !== svc.duration_minutes) {
      if (!Number.isInteger(input.duration_minutes) || input.duration_minutes <= 0) {
        return { error: 'Service duration must be a positive integer.' };
      }
      changes.push(`duration ${input.duration_minutes} min`);
      svc.duration_minutes = input.duration_minutes;
    }
    if (input.price !== undefined && input.price !== svc.price) {
      if (typeof input.price !== 'string' || !input.price.trim()) {
        return { error: 'Service price must be a non-empty string.' };
      }
      changes.push(`price ${input.price}`);
      svc.price = input.price;
    }
    if (changes.length === 0) return { error: `No actual changes specified for "${input.name}".` };
    note = `Updated service "${input.name}": ${changes.join(', ')}`;
  } else if (toolName === 'remove_service') {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      return { error: 'Service name is required.' };
    }
    const idx = findServiceIndex(next, input.name);
    if (idx === -1) return { error: `No service named "${input.name}".` };
    next.services.splice(idx, 1);
    note = `Removed service "${input.name}"`;
  } else if (toolName === 'add_rule') {
    if (!input.rule || !input.rule.trim()) return { error: 'Rule cannot be empty.' };
    if (next.booking_rules.includes(input.rule.trim())) {
      return { error: 'That rule already exists.' };
    }
    next.booking_rules.push(input.rule.trim());
    note = `Added booking rule: "${input.rule.trim()}"`;
  } else if (toolName === 'remove_rule') {
    if (typeof input.rule !== 'string' || !input.rule.trim()) return { error: 'Rule cannot be empty.' };
    const idx = next.booking_rules.findIndex(r => r === input.rule);
    if (idx === -1) return { error: `No rule matching "${input.rule}". Match must be exact.` };
    next.booking_rules.splice(idx, 1);
    note = `Removed booking rule: "${input.rule}"`;
  } else if (toolName === 'set_weekly_hours') {
    if (!Array.isArray(input.days) || input.days.length === 0) {
      return { error: 'days must be a non-empty array.' };
    }
    next.weekly_hours = next.weekly_hours || {};
    const changed = [];
    for (const d of input.days) {
      if (!d || !DAY_KEYS.includes(d.day)) return { error: `Invalid day "${d?.day}". Use mon..sun.` };
      const existing = next.weekly_hours[d.day] || { open: '09:00', close: '17:00', closed: false };
      const open = d.open ?? existing.open;
      const close = d.close ?? existing.close;
      const closed = typeof d.closed === 'boolean' ? d.closed : !!existing.closed;
      if (!closed) {
        if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
          return { error: `${d.day}: open/close must be HH:MM 24h.` };
        }
        if (hmToMin(open) >= hmToMin(close)) {
          return { error: `${d.day}: open must be before close.` };
        }
      }
      next.weekly_hours[d.day] = { open, close, closed };
      changed.push(closed ? `${d.day}=closed` : `${d.day}=${open}–${close}`);
    }
    note = `Set hours: ${changed.join(', ')}`;
  } else if (toolName === 'add_blocked_date') {
    if (typeof input.date !== 'string' || !isValidLocalDate(input.date)) return { error: 'date must be a valid YYYY-MM-DD date.' };
    next.blocked_dates = Array.isArray(next.blocked_dates) ? next.blocked_dates.slice() : [];
    if (next.blocked_dates.includes(input.date)) return { error: `${input.date} is already blocked.` };
    next.blocked_dates.push(input.date);
    next.blocked_dates.sort();
    note = `Added closed date ${input.date}`;
  } else if (toolName === 'remove_blocked_date') {
    if (typeof input.date !== 'string' || !isValidLocalDate(input.date)) return { error: 'date must be a valid YYYY-MM-DD date.' };
    next.blocked_dates = Array.isArray(next.blocked_dates) ? next.blocked_dates.slice() : [];
    const idx = next.blocked_dates.indexOf(input.date);
    if (idx === -1) return { error: `${input.date} is not in the blocked-dates list.` };
    next.blocked_dates.splice(idx, 1);
    note = `Removed closed date ${input.date}`;
  } else if (toolName === 'set_about') {
    if (typeof input.text !== 'string') return { error: 'text must be a string.' };
    const trimmed = input.text.trim();
    if (trimmed.length > 4000) return { error: 'about text is too long (max 4000 chars).' };
    if (trimmed) next.about = trimmed; else delete next.about;
    note = trimmed ? 'Updated the about/knowledge text' : 'Cleared the about/knowledge text';
  } else {
    return { error: `Unknown tool: ${toolName}` };
  }

  const result = applyBusinessUpdate(next, user, note);
  if (result.error) return { error: result.error };
  return { ok: true, applied: note };
}

function buildAdminSystemPrompt(currentBusiness) {
  const currentAi = aiSettings.getSettings();
  return `You are the Dunper Setup Assistant. You help business owners configure their AI receptionist ("frontdesk") — the bot that answers their customers. The owner is a small-business operator, not a developer; speak plainly.

When the owner asks for a change, USE THE TOOLS to apply it — don't just describe what you would do.

WHAT YOU CAN CHANGE
- Business identity: name, type, address, phone, tone, fallback_contact (use update_business_field)
- Services / products: add/update/remove with name + duration + price
- Booking rules: short policy sentences
- Weekly hours: per-day open/close + closed toggle (use set_weekly_hours)
- Closed dates: specific YYYY-MM-DD entries (use add_blocked_date / remove_blocked_date)
- About / knowledge: free-text facts the AI should know (use set_about)
- AI settings: model, max_tokens, temperature, monthly_budget_usd, budget_action,
  tone (professional|friendly|casual), starter_message, fallback_message,
  auto_handoff_after_unresolved (use update_ai_setting)

CONVERSATION STYLE
- Be concise. After each action, briefly confirm what you changed in plain language.
- If a request is ambiguous (e.g. "raise prices" — by how much?), ask before acting.
- If the owner asks something unrelated to editing the config (e.g. small talk, general advice), answer briefly without tools.
- Never invent service or rule names; if a target doesn't exist, say so.
- Match service names case-insensitively when finding what to update or remove. The exact stored capitalization stays unless the owner specifies a rename.
- For "what model should I use?" type cost questions: Sonnet 4.6 is highest-quality but ~3x more expensive than Haiku 4.5; Haiku 4.5 is plenty for most frontdesk Q&A. Default is Haiku.
- After your tool calls succeed, end your turn with a short confirmation. Don't repeat the full new config back unless asked.

How tool results work:
- A successful tool result is shaped \`{ "ok": true, "applied": "<summary of what just changed>" }\`. The "applied" line describes a change YOU just made — phrase your reply as a confirmation of that change ("Done — I've added X"), NOT as a description of pre-existing state.
- An error result is shaped \`{ "error": "..." }\`. Read it carefully — common causes are name mismatches or duplicates.

BUSINESS SNAPSHOT (high-level — call get_business for the full config when you need details):
- Name: ${currentBusiness.name} (${currentBusiness.type})
- Tone: ${currentBusiness.tone}
- Services: ${(currentBusiness.services || []).length} configured${currentBusiness.services?.length ? ` — e.g. ${currentBusiness.services.slice(0,3).map(s => s.name).join(', ')}` : ''}
- Booking rules: ${(currentBusiness.booking_rules || []).length} configured
- Weekly hours: ${currentBusiness.weekly_hours ? 'set' : 'not set (using free-text hours field)'}
- Blocked dates: ${(currentBusiness.blocked_dates || []).length}

AI SETTINGS SNAPSHOT (call get_ai_settings for full state):
- Model: ${currentAi.model} (max_tokens=${currentAi.max_tokens}, temperature=${currentAi.temperature})
- Monthly budget: $${currentAi.monthly_budget_usd} — action=${currentAi.budget_action}
- Tone: ${currentAi.tone}`;
}

function extractText(content) {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

// Mark the last user message with cache_control so Anthropic caches the
// system+tools+history prefix and reuses it on the next tool-loop iteration
// (or next turn). See customer_chat.js for the same trick.
function markLastUserCacheBreakpoint(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') m.content = [{ type: 'text', text: m.content }];
    if (!Array.isArray(m.content) || m.content.length === 0) return;
    for (const block of m.content) {
      if (block && block.cache_control) delete block.cache_control;
    }
    const last = m.content[m.content.length - 1];
    if (last && typeof last === 'object') last.cache_control = { type: 'ephemeral' };
    return;
  }
}

async function runAdminChat(userMessages, user) {
  const messages = cloneMessages(userMessages);
  const toolCalls = [];
  let mutated = false;
  const systemPrompt = buildAdminSystemPrompt(getBusiness());

  // The system prompt embeds the entire business config and is reused on
  // every tool-loop iteration. Mark it ephemeral so Anthropic prompt-caches
  // it for the duration of the turn — same trick as the customer chat path
  // (see config/claude.js buildSystem).
  const systemBlocks = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    markLastUserCacheBreakpoint(messages);
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemBlocks,
      tools,
      messages,
    });

    try {
      const u = response.usage || {};
      recordAnthropicUsage({
        callSite: 'admin_chat',
        profileId: null,
        model: MODEL,
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreationTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
        costUsd: estimateCost(MODEL, u),
      });
    } catch (err) {
      console.error('[Usage] admin_chat log failed:', err.message);
    }

    if (response.stop_reason !== 'tool_use') {
      return {
        reply: extractText(response.content) || '(no reply)',
        business: mutated ? getBusiness() : null,
        toolCalls,
      };
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = executeTool(block.name, block.input, user);
      if (result.ok && block.name !== 'get_business') mutated = true;
      toolCalls.push({ name: block.name, input: block.input, ok: !result.error });
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

  return {
    reply: 'I hit the action limit — let me know what to do next.',
    business: mutated ? getBusiness() : null,
    toolCalls,
  };
}

module.exports = { runAdminChat };
