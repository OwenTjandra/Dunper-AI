const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT_CACHE_THRESHOLD = 1024;

function buildSystem(systemPrompt) {
  if (typeof systemPrompt !== 'string') return systemPrompt;
  if (systemPrompt.length < SYSTEM_PROMPT_CACHE_THRESHOLD) return systemPrompt;
  return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
}

async function askClaude(messages, systemPrompt, opts = {}) {
  const response = await client.messages.create({
    model: opts.model || 'claude-sonnet-4-6',
    max_tokens: opts.max_tokens || 1024,
    system: buildSystem(systemPrompt),
    messages: messages,
  });
  return response.content[0].text;
}

module.exports = { askClaude };
