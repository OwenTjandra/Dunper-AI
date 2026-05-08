-- 1. Track where each booking came from (web chat, WhatsApp, dashboard).
ALTER TABLE bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'web';

-- 2. Customer-initiated escalations to a human agent.
CREATE TABLE IF NOT EXISTS escalations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id    INTEGER NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | resolved
  resolved_by_username TEXT,
  resolved_note TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_escalations_profile ON escalations(profile_id);

-- 3. Questions where the AI couldn't confidently answer.
CREATE TABLE IF NOT EXISTS unanswered_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id    INTEGER NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  message_id    INTEGER REFERENCES customer_messages(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  reply_text    TEXT,
  reason        TEXT,                          -- 'fallback_phrase' | 'too_short' | 'manual'
  status        TEXT NOT NULL DEFAULT 'open',  -- open | reviewed | answered
  reviewed_by_username TEXT,
  reviewed_note TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_unanswered_status ON unanswered_questions(status, created_at);

-- 4. Outbox of every email the system tries to send. Acts as paper trail
--    even when SMTP isn't configured (status='skipped_no_smtp').
CREATE TABLE IF NOT EXISTS email_outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address    TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  body_html     TEXT,
  category      TEXT NOT NULL,                  -- 'booking_confirmation' | etc
  related_id    INTEGER,                        -- e.g. booking id
  status        TEXT NOT NULL DEFAULT 'pending',-- pending | sent | failed | skipped_no_smtp
  error_text    TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, created_at);
