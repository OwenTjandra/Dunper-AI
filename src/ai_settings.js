const { db } = require('./db');

const SETTING_KEYS = [
  'model',
  'max_tokens',
  'temperature',
  'monthly_budget_usd',
  'budget_action',
  'downgrade_model',
  'daily_msgs_per_customer',
  'daily_convos_total',
  'starter_message',
  'fallback_message',
  'tone',
  'human_handoff_enabled',
  'policy_enforcement_enabled',
  'language_detection_enabled',
  'topic_boundaries_enabled',
  'auto_handoff_after_unresolved',
  'quiet_hours_start',
  'quiet_hours_end',
];

const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-7',
]);
const ALLOWED_BUDGET_ACTIONS = new Set(['downgrade', 'block', 'warn_only']);
const ALLOWED_TONES = new Set(['professional', 'friendly', 'casual']);

let cached = null;

function rowToSettings(row) {
  if (!row) return defaults();
  return {
    model: row.model,
    max_tokens: row.max_tokens,
    temperature: row.temperature,
    monthly_budget_usd: row.monthly_budget_usd,
    budget_action: row.budget_action,
    downgrade_model: row.downgrade_model,
    daily_msgs_per_customer: row.daily_msgs_per_customer,
    daily_convos_total: row.daily_convos_total,
    starter_message: row.starter_message,
    fallback_message: row.fallback_message,
    tone: row.tone,
    human_handoff_enabled: !!row.human_handoff_enabled,
    policy_enforcement_enabled: !!row.policy_enforcement_enabled,
    language_detection_enabled: !!row.language_detection_enabled,
    topic_boundaries_enabled: !!row.topic_boundaries_enabled,
    auto_handoff_after_unresolved: row.auto_handoff_after_unresolved,
    quiet_hours_start: row.quiet_hours_start || '',
    quiet_hours_end: row.quiet_hours_end || '',
    updated_at: row.updated_at,
  };
}

function defaults() {
  return {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0.7,
    monthly_budget_usd: 50.0,
    budget_action: 'downgrade',
    downgrade_model: 'claude-haiku-4-5-20251001',
    daily_msgs_per_customer: 60,
    daily_convos_total: 2000,
    starter_message: 'Hi! How can I help you today?',
    fallback_message: 'Sorry, let me connect you to our team.',
    tone: 'professional',
    human_handoff_enabled: true,
    policy_enforcement_enabled: true,
    language_detection_enabled: true,
    topic_boundaries_enabled: true,
    auto_handoff_after_unresolved: 3,
    quiet_hours_start: '',
    quiet_hours_end: '',
  };
}

function load() {
  const row = db.prepare('SELECT * FROM ai_settings WHERE id = 1').get();
  cached = rowToSettings(row);
  return cached;
}

function getSettings() {
  if (!cached) return load();
  return cached;
}

function validate(input) {
  const out = {};
  if (input.model != null) {
    if (!ALLOWED_MODELS.has(input.model)) return { error: `model must be one of: ${[...ALLOWED_MODELS].join(', ')}` };
    out.model = input.model;
  }
  if (input.downgrade_model != null) {
    if (!ALLOWED_MODELS.has(input.downgrade_model)) return { error: 'downgrade_model invalid' };
    out.downgrade_model = input.downgrade_model;
  }
  if (input.budget_action != null) {
    if (!ALLOWED_BUDGET_ACTIONS.has(input.budget_action)) return { error: 'budget_action invalid' };
    out.budget_action = input.budget_action;
  }
  if (input.tone != null) {
    if (!ALLOWED_TONES.has(input.tone)) return { error: 'tone invalid' };
    out.tone = input.tone;
  }

  const ints = {
    max_tokens: [64, 4096],
    daily_msgs_per_customer: [1, 10000],
    daily_convos_total: [1, 1000000],
    auto_handoff_after_unresolved: [1, 50],
  };
  for (const [k, [min, max]] of Object.entries(ints)) {
    if (input[k] == null || input[k] === '') continue;
    const n = Number(input[k]);
    if (!Number.isInteger(n) || n < min || n > max) return { error: `${k} must be an integer in [${min}, ${max}]` };
    out[k] = n;
  }

  const floats = {
    temperature: [0, 1],
    monthly_budget_usd: [0, 100000],
  };
  for (const [k, [min, max]] of Object.entries(floats)) {
    if (input[k] == null || input[k] === '') continue;
    const n = Number(input[k]);
    if (!Number.isFinite(n) || n < min || n > max) return { error: `${k} must be a number in [${min}, ${max}]` };
    out[k] = n;
  }

  const strings = ['starter_message', 'fallback_message'];
  for (const k of strings) {
    if (input[k] == null) continue;
    if (typeof input[k] !== 'string') return { error: `${k} must be a string` };
    if (input[k].length > 500) return { error: `${k} too long (max 500 chars)` };
    out[k] = input[k];
  }

  const bools = [
    'human_handoff_enabled',
    'policy_enforcement_enabled',
    'language_detection_enabled',
    'topic_boundaries_enabled',
  ];
  for (const k of bools) {
    if (input[k] == null) continue;
    out[k] = input[k] === true || input[k] === 1 || input[k] === '1' || input[k] === 'true' ? 1 : 0;
  }

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const k of ['quiet_hours_start', 'quiet_hours_end']) {
    if (input[k] == null) continue;
    if (input[k] === '') {
      out[k] = null;
      continue;
    }
    if (typeof input[k] !== 'string' || !timeRe.test(input[k])) return { error: `${k} must be HH:MM` };
    out[k] = input[k];
  }

  return { ok: true, fields: out };
}

function saveSettings(input, userId) {
  const v = validate(input);
  if (v.error) return { error: v.error, status: 400 };

  const setClauses = [];
  const values = [];
  for (const [k, val] of Object.entries(v.fields)) {
    setClauses.push(`${k} = ?`);
    values.push(val);
  }
  if (setClauses.length === 0) return { ok: true, settings: getSettings() };

  setClauses.push(`updated_at = datetime('now')`);
  if (userId) {
    setClauses.push('updated_by = ?');
    values.push(userId);
  }
  values.push(1);

  db.prepare(`UPDATE ai_settings SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  cached = null;
  return { ok: true, settings: getSettings() };
}

// Helper used by askClaude callers — picks the model that respects the budget cap.
function resolveModel() {
  const s = getSettings();
  // Spend check is delegated to db.js getMonthlyAnthropicSpend if available.
  let monthlySpend = 0;
  try {
    monthlySpend = db
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM anthropic_usage_log
                WHERE created_at >= datetime('now', 'start of month')`)
      .get().spent || 0;
  } catch (_e) {
    // anthropic_usage_log may not exist in older deploys
  }
  const overBudget = monthlySpend >= s.monthly_budget_usd;
  if (!overBudget) return { model: s.model, max_tokens: s.max_tokens, temperature: s.temperature, blocked: false };

  if (s.budget_action === 'block') return { model: null, max_tokens: 0, temperature: 0, blocked: true, reason: 'monthly_budget_exceeded' };
  if (s.budget_action === 'downgrade') return { model: s.downgrade_model, max_tokens: s.max_tokens, temperature: s.temperature, blocked: false, downgraded: true };
  return { model: s.model, max_tokens: s.max_tokens, temperature: s.temperature, blocked: false };
}

module.exports = {
  SETTING_KEYS,
  getSettings,
  saveSettings,
  resolveModel,
  defaults,
};
