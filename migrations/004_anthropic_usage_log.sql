-- Track every call to the Anthropic API so we can model unit economics
-- per customer profile, per call site, and per day. Critical for pricing
-- decisions and for spotting runaway customers before they blow the budget.

CREATE TABLE IF NOT EXISTS anthropic_usage_log (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  call_site                TEXT NOT NULL,                    -- 'chat' | 'whatsapp' | 'summarize' | 'compaction' | 'admin_chat'
  profile_id               INTEGER REFERENCES customer_profiles(id) ON DELETE SET NULL,
  model                    TEXT,
  input_tokens             INTEGER NOT NULL DEFAULT 0,
  output_tokens            INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens    INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_usd                 REAL NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anthropic_usage_created ON anthropic_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_anthropic_usage_profile ON anthropic_usage_log(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_anthropic_usage_callsite ON anthropic_usage_log(call_site, created_at);
