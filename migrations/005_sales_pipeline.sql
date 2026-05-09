-- Founder/operator-side sales pipeline. Distinct from customer_profiles
-- (which are end-users chatting with the bot). These are *Dunper's*
-- prospective and paying customers — the businesses I'm selling to.
-- Manual entry for now; will auto-populate when multi-tenant lands.

CREATE TABLE IF NOT EXISTS sales_clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name   TEXT NOT NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  vertical        TEXT,                                  -- 'salon' | 'dental' | 'restaurant' | etc
  status          TEXT NOT NULL DEFAULT 'lead',          -- lead | demo_scheduled | demo_done | proposal_sent | active | churned | lost
  plan            TEXT,                                  -- 'starter' | 'pro' | 'max' | 'custom'
  mrr_usd         REAL,                                  -- monthly recurring revenue if paying
  notes           TEXT,
  next_step       TEXT,
  next_step_at    TEXT,                                  -- ISO date for next contact / demo / followup
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_clients(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_next_step ON sales_clients(next_step_at);
