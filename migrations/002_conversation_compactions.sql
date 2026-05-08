-- Conversation compaction: rolled-up summary of older messages so we don't
-- send the full history to Claude on every turn. One row per customer
-- profile, regenerated when stale (more than COMPACTION_THRESHOLD messages
-- have arrived since the last compaction).

CREATE TABLE IF NOT EXISTS conversation_compactions (
  profile_id          INTEGER PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  through_message_id  INTEGER NOT NULL,
  summary             TEXT NOT NULL,
  message_count       INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
