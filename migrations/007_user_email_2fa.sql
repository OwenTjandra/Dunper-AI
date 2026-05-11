-- 2FA via email confirmation code.
-- Each user gets an optional `email` (their linked Gmail address).
-- On login, if the user has an email set, we generate a 6-digit code,
-- store it in `login_codes`, email it to them, and require them to enter
-- it before we issue a session.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN twofa_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS login_codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_codes_user_unused ON login_codes(user_id, used);
