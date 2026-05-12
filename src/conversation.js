const {
  getCustomerMessages,
  getConversationCompaction,
  upsertConversationCompaction,
  getAttachmentsForMessage,
  recordAnthropicUsage,
} = require('./db');
const { askClaude } = require('./config/claude');

const COMPACTION_TRIGGER_MESSAGES = 30;
const VERBATIM_WINDOW = 10;

const SUMMARIZE_SYSTEM_PROMPT = `You are summarizing a customer's chat with a business frontdesk assistant. Output a single concise paragraph (max 150 words) that preserves what matters for continuing the conversation:
- What the customer asked about or wanted
- Any personal details they shared (name, phone, email, preferences, constraints)
- What was promised, booked, or resolved
- Anything outstanding or unresolved
- Notable images they shared (described, e.g. "shared photo of broken filling")

Output plain text only. No markdown, no bullet lists, no headings.`;

function syntheticCompactionMessages(summary) {
  return [
    { role: 'user', content: `[Earlier in this conversation: ${summary}]` },
    { role: 'assistant', content: 'Got it — I have that context.' },
  ];
}

function attachmentsBriefForCompaction(messageId) {
  const atts = getAttachmentsForMessage(messageId);
  if (!atts.length) return '';
  return ` [shared ${atts.length} image${atts.length === 1 ? '' : 's'}: ${atts.map(a => a.original_filename).join(', ')}]`;
}

function buildBaseMessagesForClaude(profileId) {
  const all = getCustomerMessages(profileId);

  if (all.length <= COMPACTION_TRIGGER_MESSAGES) {
    return { messages: all, usedCompaction: false };
  }

  const compaction = getConversationCompaction(profileId);
  if (!compaction) {
    return { messages: all, usedCompaction: false };
  }

  const afterCompaction = all.filter(m => m.id > compaction.through_message_id);
  const synthetic = syntheticCompactionMessages(compaction.summary);
  return {
    messages: [
      ...synthetic.map((m, i) => ({ id: `synth-${i}`, role: m.role, content: m.content })),
      ...afterCompaction,
    ],
    usedCompaction: true,
  };
}

function shouldCompact(profileId) {
  const all = getCustomerMessages(profileId);
  if (all.length <= COMPACTION_TRIGGER_MESSAGES) return false;

  const compaction = getConversationCompaction(profileId);
  if (!compaction) return true;

  const newSinceCompaction = all.filter(m => m.id > compaction.through_message_id).length;
  return newSinceCompaction > COMPACTION_TRIGGER_MESSAGES;
}

async function compactConversation(profileId) {
  const all = getCustomerMessages(profileId);
  if (all.length <= VERBATIM_WINDOW) return;

  const toCompact = all.slice(0, all.length - VERBATIM_WINDOW);
  if (toCompact.length === 0) return;

  const throughMessageId = toCompact[toCompact.length - 1].id;
  const existing = getConversationCompaction(profileId);

  let prompt = '';
  if (existing) {
    prompt += `Previous summary of even older messages:\n${existing.summary}\n\n`;
  }
  prompt += `New messages to incorporate (oldest first):\n`;
  prompt += toCompact
    .map(m => `${m.role.toUpperCase()}: ${m.content}${attachmentsBriefForCompaction(m.id)}`)
    .join('\n');

  const { text: summary, usage } = await askClaude(
    [{ role: 'user', content: prompt }],
    SUMMARIZE_SYSTEM_PROMPT,
    { max_tokens: 400, model: 'claude-haiku-4-5-20251001' }
  );

  try {
    recordAnthropicUsage({
      callSite: 'compaction',
      profileId,
      model: usage.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_tokens,
      cacheReadTokens: usage.cache_read_tokens,
      costUsd: usage.cost_usd,
    });
  } catch (err) {
    console.error('[Usage] compaction log failed:', err.message);
  }

  upsertConversationCompaction({
    profileId,
    throughMessageId,
    summary: summary.trim(),
    messageCount: toCompact.length,
  });

  return summary;
}

function maybeCompactInBackground(profileId) {
  if (!shouldCompact(profileId)) return;
  setImmediate(() => {
    compactConversation(profileId).catch(err => {
      console.error('[Compaction] failed for profile', profileId, err.message);
    });
  });
}

module.exports = {
  buildBaseMessagesForClaude,
  shouldCompact,
  compactConversation,
  maybeCompactInBackground,
  COMPACTION_TRIGGER_MESSAGES,
  VERBATIM_WINDOW,
};
