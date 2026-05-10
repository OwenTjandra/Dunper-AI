-- Add role column for separating business-owner vs founder dashboards.
-- Existing users are treated as business_owner by default; founders are seeded
-- from the FOUNDERS env var on server startup.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'business_owner';
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
