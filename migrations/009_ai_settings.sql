-- Tunable AI parameters for the deployment. Single-row table (id = 1)
-- because Dunper is single-tenant per deployment today. When we go
-- multi-tenant (scaling-roadmap.md), this table becomes per-workspace.

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  -- Model & generation
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  temperature REAL NOT NULL DEFAULT 0.7,

  -- Cost guardrails
  monthly_budget_usd REAL NOT NULL DEFAULT 50.0,
  budget_action TEXT NOT NULL DEFAULT 'downgrade' CHECK (budget_action IN ('downgrade','block','warn_only')),
  downgrade_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',

  -- Abuse / rate limits
  daily_msgs_per_customer INTEGER NOT NULL DEFAULT 60,
  daily_convos_total INTEGER NOT NULL DEFAULT 2000,

  -- Conversation behaviour
  starter_message TEXT NOT NULL DEFAULT 'Hi! How can I help you today?',
  fallback_message TEXT NOT NULL DEFAULT 'Sorry, let me connect you to our team.',
  tone TEXT NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional','friendly','casual')),

  -- Policy toggles
  human_handoff_enabled INTEGER NOT NULL DEFAULT 1,
  policy_enforcement_enabled INTEGER NOT NULL DEFAULT 1,
  language_detection_enabled INTEGER NOT NULL DEFAULT 1,
  topic_boundaries_enabled INTEGER NOT NULL DEFAULT 1,

  -- Handoff threshold
  auto_handoff_after_unresolved INTEGER NOT NULL DEFAULT 3,

  -- Quiet hours (24h "HH:MM" or NULL/empty for off). When set, AI replies
  -- still go out but get prefixed with an after-hours note.
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,

  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO ai_settings (id) VALUES (1);
