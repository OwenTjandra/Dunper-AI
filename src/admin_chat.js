const Anthropic = require('@anthropic-ai/sdk');
const { getBusiness, applyBusinessUpdate } = require('./business');
const { recordAnthropicUsage } = require('./db');
const { estimateCost } = require('./config/claude');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 10;

const TOP_LEVEL_FIELDS = ['name', 'type', 'hours', 'address', 'phone', 'tone', 'fallback_contact'];

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
  } else {
    return { error: `Unknown tool: ${toolName}` };
  }

  const result = applyBusinessUpdate(next, user, note);
  if (result.error) return { error: result.error };
  return { ok: true, applied: note };
}

function buildAdminSystemPrompt(currentBusiness) {
  return `You are an assistant helping a business owner edit the configuration for their AI receptionist ("frontdesk"). The owner's config controls what the customer-facing AI tells callers.

When the owner asks for a change, USE THE TOOLS to apply it — don't just describe what you would do.

Rules:
- Be concise. After each action, briefly confirm what you changed in plain language.
- If a request is ambiguous (e.g. "raise prices" — by how much?), ask before acting.
- If the owner asks something unrelated to editing the config (e.g. small talk, general advice), answer briefly without tools.
- Never invent service or rule names; if a target doesn't exist, say so.
- Match service names case-insensitively when finding what to update or remove. The exact stored capitalization stays unless the owner specifies a rename.
- After your tool calls succeed, end your turn with a short confirmation. Don't repeat the full new config back unless asked.

How tool results work:
- A successful tool result is shaped \`{ "ok": true, "applied": "<summary of what just changed>" }\`. The "applied" line describes a change YOU just made — phrase your reply as a confirmation of that change ("Done — I've added X"), NOT as a description of pre-existing state.
- An error result is shaped \`{ "error": "..." }\`. Read it carefully — common causes are name mismatches or duplicates.

CURRENT BUSINESS CONFIG (JSON, as of the start of this turn — your tool calls may have changed it since):
${JSON.stringify(currentBusiness, null, 2)}`;
}

function extractText(content) {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

async function runAdminChat(userMessages, user) {
  const messages = [...userMessages];
  const toolCalls = [];
  let mutated = false;
  const systemPrompt = buildAdminSystemPrompt(getBusiness());

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
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
