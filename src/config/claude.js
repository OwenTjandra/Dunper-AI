const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default cap for chat replies. 512 is plenty for frontdesk-style answers
// and stops Claude from rambling when the customer's question is open-ended.
// Callers can still override via opts.max_tokens.
const DEFAULT_MAX_TOKENS = 512;

// Pricing (USD per million tokens). Cache write = 1.25x base input, cache
// read = 0.10x of base input. Update when Anthropic changes pricing.
const PRICING = {
  'claude-sonnet-4-6': {
    input:        3.00,
    output:       15.00,
    cacheCreate:  3.75,
    cacheRead:    0.30,
  },
  'claude-haiku-4-5-20251001': {
    input:        1.00,
    output:       5.00,
    cacheCreate:  1.25,
    cacheRead:    0.10,
  },
  'claude-opus-4-7': {
    input:        15.00,
    output:       75.00,
    cacheCreate:  18.75,
    cacheRead:    1.50,
  },
};

// Always wrap a string system prompt with cache_control. Anthropic ignores
// the marker when the cached span is below the model's minimum token count
// (1024 for Sonnet/Opus, 2048 for Haiku), so there's no penalty for sending
// it on short prompts — and a real win the moment the prompt grows.
function buildSystem(systemPrompt) {
  if (typeof systemPrompt !== 'string') return systemPrompt;
  return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
}

function estimateCost(model, usage) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6'];
  const inputBase    = (usage.input_tokens || 0) - (usage.cache_creation_input_tokens || 0) - (usage.cache_read_input_tokens || 0);
  const cost =
    (Math.max(inputBase, 0) / 1_000_000) * p.input +
    ((usage.output_tokens || 0) / 1_000_000) * p.output +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * p.cacheCreate +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * p.cacheRead;
  return Math.round(cost * 1_000_000) / 1_000_000;  // 6 decimals
}

async function askClaude(messages, systemPrompt, opts = {}) {
  const model = opts.model || 'claude-sonnet-4-6';
  const params = {
    model,
    max_tokens: opts.max_tokens || DEFAULT_MAX_TOKENS,
    system: buildSystem(systemPrompt),
    messages: messages,
  };
  if (Number.isFinite(opts.temperature)) params.temperature = opts.temperature;
  const response = await client.messages.create(params);
  // Robust against responses where content[0] is a thinking/tool_use block
  // or where content is empty (e.g. a degenerate streaming error).
  const text = (response.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('\n');
  const usage = response.usage || {};
  return {
    text,
    usage: {
      model,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_tokens: usage.cache_read_input_tokens || 0,
      cost_usd: estimateCost(model, usage),
    },
  };
}

module.exports = { askClaude, estimateCost, client };
