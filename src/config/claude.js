const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT_CACHE_THRESHOLD = 1024;

// Pricing for Claude Sonnet 4.6 (USD per million tokens). Update if Anthropic
// changes pricing or when we move to a different model. Cache write is 1.25x
// of base input; cache read is 0.10x of base input.
const PRICING = {
  'claude-sonnet-4-6': {
    input:        3.00,
    output:       15.00,
    cacheCreate:  3.75,
    cacheRead:    0.30,
  },
};

function buildSystem(systemPrompt) {
  if (typeof systemPrompt !== 'string') return systemPrompt;
  if (systemPrompt.length < SYSTEM_PROMPT_CACHE_THRESHOLD) return systemPrompt;
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
    max_tokens: opts.max_tokens || 1024,
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
