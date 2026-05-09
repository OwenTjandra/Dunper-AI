# Dunper AI — backend scaling roadmap

A realistic, opinionated plan for going from 1 customer to 1000. Tied to revenue and the actual code you have today, not a wishlist.

## Context

Today (2026-05-09) Dunper AI is **fully single-tenant**. Confirmed by code audit:

- All 14+ DB tables (`customer_profiles`, `bookings`, `customer_messages`, etc.) have **no `workspace_id` column** — one server = one business
- `google_connection` table has `CHECK (id = 1)` enforcing one Google account per deployment
- All integration env vars (`GOOGLE_OAUTH_CLIENT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `SMTP_USER`, `ANTHROPIC_API_KEY`, `ADMIN_USERNAME`) are deployment-global
- No URL/host-based routing — server assumes one business per port
- File paths (`business.json`, `uploads/business/`, `public/uploads/business-logos/`) are deployment-global
- 4 `askClaude()` call sites have no tenant attribution — can't bill per customer

**This isn't a bug — it's a deliberate "white-label per client" choice from the original plan.** It's the right choice for 1-10 customers and the wrong choice past 20. The roadmap below is about when to flip.

---

## The seven milestones

### 🟢 1 customer (now)

**Architecture:** Current setup. Single Node.js + SQLite on Thomas's laptop. Quick Cloudflare tunnel. Manual onboarding (edit `business.json`, click through Google OAuth, set up Meta WABA).

**Cost / month:**
- Anthropic: ~$5–20 depending on chat volume
- Hosting: $0 (laptop)
- Domain: ~$1 (already paid annual)
- **Total: $5–20**

**Ops:** Yourself. Fix bugs as customers report them.

**What's wrong:** Laptop must stay on. Quick tunnel URL rotates every restart. No customer can find you if Thomas closes the lid.

**When you outgrow:** Day one of paid customer. They'll ask "what's our URL?" and you can't give them a stable one.

---

### 🟢 3 customers

**Architecture:** Same single-tenant code, **3 separate deployments**. Move off the laptop:

- 3× **Hetzner CX22** ($5/mo each) or **Railway Hobby** ($5/mo each) → one Node process per customer
- Each gets: own subdomain (e.g., `drsmith.dunper.com`, `bellasalon.dunper.com`), own `data.db`, own `business.json`, own Google OAuth credentials, own WhatsApp WABA
- **Cloudflare named tunnel** (or just Cloudflare Pages + a backend on the VPS) gives stable URLs
- DNS: wildcard `*.dunper.com` CNAME, manually configure each subdomain to a VPS

**Cost / month:**
- Hosting: $15 (3× $5 VPS)
- Anthropic: $30 (~$10 avg per customer)
- Domains: $1
- **Total: ~$45**

**Ops:** ~2 hours/month. Manual onboarding still — but write it down as a checklist.

**What changes from milestone 1:** Build a **`scripts/onboard-client.sh`** that scaffolds a new instance: provisions VPS, runs migrations, seeds admin user, sets up the subdomain. Otherwise each new customer is a panic.

**When you outgrow:** Around customer 8-10 — you start dreading the onboarding chore.

---

### 🟡 5 customers

**Architecture:** Still per-deployment, but **provisioning is now scripted**.

- Convert your onboarding script into **Docker Compose** + **Terraform/Ansible**. Spin up a new client in 10 min instead of 90.
- Centralize observability: 1 free **UptimeRobot** account watching all 5 endpoints, **Healthchecks.io** for the daily backup cron
- **All backups going to a shared S3 bucket** (or Cloudflare R2 — free tier 10GB) keyed by customer slug
- Bookkeeping: spreadsheet (or a Notion DB) tracking — for each customer — Anthropic spend, customer email, plan, churn risk
- Per-customer monthly cost report: write a small script that reads each customer's `data.db` and reports message counts so you can map cost to revenue.

**Cost / month:**
- Hosting: $25
- Anthropic: $50
- Domains: $1
- Backups (R2): $0 (free tier)
- Monitoring: $0 (free tier)
- **Total: ~$75**

**Ops:** ~5 hours/month including occasional support emails.

**Decision point:** Are these customers paying enough to justify the per-deployment overhead? At $50/mo plan price → $250 revenue → $175 profit. Healthy. At $20/mo → $100 revenue → $25 profit. Bad — fix pricing or pivot.

---

### 🟡 10 customers

**Architecture:** Last gasp of the per-deployment model.

- 10 VPSes ($50/mo) is annoying but feasible
- **Provisioning script must be 100% reliable** — can't afford manual fixes anymore
- Per-customer Anthropic spend tracking is critical: add a small `usage_log` table to each `data.db` that records every `askClaude` call's input/output tokens. Aggregate weekly. Find the customer who's burning your margin.
- **Per-customer rate limits get tightened** based on their plan tier (Starter: 200 conv/mo, Pro: 1500, Max: 5000)
- Email confirmations now go through **Resend** ($20/mo for 50k emails) — Gmail SMTP doesn't scale
- **One on-call phone**: if any customer's chatbot dies at 2am, you get paged

**Cost / month:**
- Hosting: $50
- Anthropic: $120
- Resend: $20
- Backups: $0 (still free tier)
- Monitoring: $7 (UptimeRobot Pro)
- Domain: $1
- **Total: ~$200**

**Revenue at this stage:** 10 × $50 avg = $500/mo. Margin: $300/mo. Still a side project, not a business.

**The big decision:** Beyond 10 customers, **manually maintaining 10+ separate deployments becomes a bottleneck on growth.** You stop selling because you're firefighting. This is the moment to pivot to multi-tenant.

---

### 🔴 20 customers — multi-tenant migration (the painful one)

**You have to rewrite. Here's what changes:**

#### Database (1 week of work)

Migration `006_multitenant.sql`:
```sql
-- Create the workspace concept
CREATE TABLE workspaces (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,        -- e.g. "bella-salon"
  name          TEXT NOT NULL,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  plan          TEXT DEFAULT 'starter',
  status        TEXT DEFAULT 'active'
);

-- Add workspace_id to every per-tenant table:
ALTER TABLE customer_profiles ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE customer_messages ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE bookings ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE business_documents ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
-- etc., for all 14 tables
```

Drop the `CHECK (id = 1)` from `google_connection`; add `workspace_id` UNIQUE.

#### Move SQLite → Postgres

SQLite is genuinely fine up to maybe 50 concurrent users on a single server. Past that, the global write lock kills you. Migrate now while data is small. Use **Supabase free tier** ($0 up to 500MB DB) or **Neon** ($0 up to 0.5 GB).

#### Server changes

- **Tenant resolution middleware**: every request picks a workspace from `req.hostname` (e.g., `bella-salon.dunper.com` → workspace `bella-salon`). Stash on `req.workspace`. Block requests with no workspace.
- **All DB queries** get `WHERE workspace_id = ?` added. Use a query helper that requires the workspace param.
- **Filesystem isolation**: change `uploads/customer/{profileId}/` to `uploads/{workspaceId}/customer/{profileId}/`
- **OAuth state**: each workspace has its own Google OAuth connection (not the singleton)
- **WhatsApp**: each workspace has its own `whatsapp_phone_number_id` and tokens, stored in `workspaces` table — not env vars
- **Anthropic spend per workspace**: add a `usage_log` table that gets a row per `askClaude` call, with `workspace_id`, `input_tokens`, `output_tokens`, `cost_estimate`. Hook into the 4 call sites identified by the audit.

#### Self-service onboarding

- **Public signup form** at `dunper.com/start` → creates workspace, sends magic-link to admin email, lands them in their new dashboard
- They configure their own business in the dashboard (already mostly built — `runAdminChat` lets them do it in plain English)
- They click "Connect Google" (already coded — works per-workspace once we drop the singleton)
- For WhatsApp: surface clear instructions; **WA setup stays manual** for the customer (Meta requires real human verification — this can't be automated)

#### Hosting

One bigger box now (e.g., Hetzner CCX13: 2 vCPU / 8GB / $14/mo) running one Node process serving all 20 workspaces. Postgres is hosted (Supabase). Files in **Cloudflare R2**.

**Cost / month:**
- Server: $14 (one shared)
- Postgres (Supabase Pro): $25
- R2 storage: ~$1
- Anthropic: $250
- Resend: $20
- Monitoring: $7
- **Total: ~$320**

**Revenue:** 20 × $50 = $1,000/mo. Margin: $680. Now you're building something.

**Migration effort:** ~10–15 days of focused work for one engineer (you). The multi-tenant pivot is unavoidable above ~15 customers.

---

### 🔴 50 customers

**Architecture:** Real SaaS scaffolding.

- **Stripe** for billing — subscriptions, plan limits, usage caps, dunning. Add a billing event log table.
- **Per-workspace Anthropic budget caps** — when a workspace hits their monthly token quota, the chat replies with a "this business has temporarily exceeded their plan; please contact them directly" message instead of calling Claude.
- **Background job queue** — bookings/calendar/sheets/email moved off the request thread to BullMQ + Redis (Upstash $10/mo). Right now those run inline in `setImmediate` which works for a single laptop and 5 customers, not 50.
- **Customer support tooling**: route `support@dunper.com` to **Help Scout** ($25/mo) or **Crisp** (free up to 2 seats). One support email to rule them all.
- **Status page**: free at **statuspage.io** or self-host **Cachet**.
- **Logging**: ship structured logs to **Axiom** ($25/mo for 500GB) so you can answer "why did this customer's booking fail at 3am" without SSH'ing.

**Cost / month:**
- Server: $30 (slightly bigger)
- Postgres: $25
- R2: $5
- Redis (Upstash): $10
- Anthropic: $700
- Stripe fees: ~3% of revenue ≈ $75
- Resend: $20
- Help Scout: $25
- Axiom: $25
- Monitoring: $15
- **Total: ~$930**

**Revenue:** 50 × $50 = $2,500/mo. Margin: $1,570. 

You can now consider: hire a part-time customer success person ($500/mo on Upwork)? Probably yes if growth is steady.

---

### 🔴 100 customers

**Architecture:** You're a real product now.

- **Horizontal scaling**: 2-3 Node instances behind a load balancer (or just **Fly.io machines** with auto-scale). Postgres has a read replica.
- **Per-tenant rate limiting** is now per-second (not per-minute). Use Redis for the counter.
- **Anthropic prompt caching** must be tuned — at this scale you save 5-figures monthly by getting cache hit rates above 70%.
- **Customer dashboard polish**: give them their own metrics page, usage graphs, billing portal (Stripe Customer Portal — free).
- **Public API + webhooks** so customers can build automations on top of Dunper.
- **Compliance basics**: privacy policy, ToS, data deletion endpoint (GDPR-style), data export. Required if you sell into EU.
- **On-call rotation** — even if it's just you, structure it so you can take a weekend off.

**Cost / month:**
- Servers (Fly.io 3 machines): $60
- Postgres + replica: $80
- R2: $20
- Redis: $25
- Anthropic: $1,500 (with caching saves)
- Stripe fees: ~$150
- Email (Resend): $50
- Help Scout: $50 (3 seats)
- Axiom: $50
- Monitoring: $30
- **Total: ~$2,000**

**Revenue:** 100 × $50 = $5,000/mo. Margin: $3,000. **At this point Dunper is your full-time job.** Either you're already on it full-time, or you should be quitting whatever else you're doing.

**Hiring trigger**: when support consumes >15 hours/week, hire your first customer success person ($1k-2k/mo Indonesian rate).

---

### 🔴 1000 customers — real company

**Architecture:** Multi-region, multi-tier, real engineering.

- **Multi-region**: Indonesia (primary) + Singapore (DR / lower latency for SEA traffic)
- **Anthropic enterprise contract** — direct deal with Anthropic for volume pricing (vs metered API). Likely 30-40% off retail.
- **Postgres at scale**: managed (Supabase Team / RDS), with read replicas, point-in-time recovery, partitioned by workspace_id for the largest tables (`customer_messages` will be hundreds of millions of rows)
- **Background jobs**: Sidekiq-class system. Per-tenant queues so a heavy customer can't starve others.
- **Vertical config marketplace**: you've now seen 1000 SMEs. Bottle the patterns. Ship preset `business.json` templates for "dental clinic", "salon", "bakery", "restaurant" so onboarding takes 5 min not 1 hour.
- **Per-vertical pricing**: dentists pay more than bakeries because they get more value (booking density × ticket size). Roll out price tiers per vertical.
- **SOC 2** if selling to enterprise / multi-location chains. ~$30k one-time + ongoing audit.
- **Indonesian data sovereignty**: investigate whether **PP No. 71/2019** requires customer data to stay in Indonesia. If so, multi-region setup must include a real Indonesian data center (Biznet / Cloudflare ID region).
- **Engineering team**: 3-5 engineers minimum. 1 for backend platform, 1 for AI/ML quality, 1 for integrations (each new vertical wants different external tools), 1 frontend, 1 SRE/on-call.
- **Sales team**: outbound to chain businesses (10+ locations). Inbound from the marketing site.
- **Customer success**: 2-3 people. ~$40-60k/year combined in Jakarta.
- **Data warehouse** (BigQuery or Snowflake): customer behavior, churn analysis, conversion funnels. Not the operational DB.

**Cost / month:**
- Infra: $4-6k (multi-region servers, DBs, replicas, R2, Redis cluster)
- Anthropic (with enterprise discount): $8-12k
- SaaS tools: $2-3k (Stripe fees, Help Scout, Axiom, Datadog, etc.)
- Salaries: $30-60k (5-7 person team in Jakarta)
- **Total: ~$45-80k**

**Revenue:** 1000 × $50 avg = $50k. **At this scale, basic plan price economics are tight.** Either:
- (a) Average revenue per user is higher (more Pro/Max plans, multi-location), or
- (b) Operating leverage is higher than I'm estimating (lots of customers self-serve, support stays small)

In practice mature SaaS in this niche should target $80-150 ARPU (average revenue per user). At 1000 customers × $100 ARPU = $100k MRR = ~$1.2M ARR. That's a real venture-fundable business with healthy margins.

---

## Critical inflection points

| Boundary | What forces the change |
|---|---|
| **1 → 3** | Trivial. Per-customer DNS subdomain + provisioning script. |
| **3 → 10** | Provisioning automation must be solid. You cannot do this by hand. |
| **10 → 20** | **Multi-tenant migration is mandatory.** ~2 weeks of work. |
| **20 → 50** | Real billing (Stripe) + background jobs (Redis) + support tooling. |
| **50 → 100** | Horizontal scaling, per-tenant rate limiting at finer granularity, public API. |
| **100 → 1000** | Multi-region, enterprise Anthropic deal, real eng team, vertical packaging. |

---

## Decisions to make NOW (at 1 customer) that affect downstream

You don't need to act on all of these today, but you should know they're coming:

1. **Don't add `workspace_id` columns yet** — the migration system handles this cleanly when needed. Adding now creates noise.
2. **Do separate "product brand" from "customer business"** in code (already done — Dunper logo vs business logo, different display surfaces). This avoids painful renames later.
3. **Do log Anthropic token counts per call** to a `usage_log` table, even if you don't act on it yet. Without historical data you can't model unit economics.
4. **Do keep using prepared statements everywhere** (already done). When you switch SQLite → Postgres, the syntax is mostly identical.
5. **Do file customer attachments + business docs by some prefix** (already partially done). When `workspace_id` exists, the migration is `mv uploads/customer/{id} uploads/{ws}/customer/{id}` — much easier than restructuring.
6. **Don't implement custom auth** — once multi-tenant, you'll want a real auth layer. Plan to swap to **Clerk** or **WorkOS** at the 20-customer migration. Don't sink time into hardening the current bcrypt-based one.
7. **Do measure things you can't undo measuring**: customer-by-customer Anthropic spend, conversation length distribution, conversion rate by vertical. Even noisy data from 5 customers helps you pitch the next 50.

---

## Files to reference at each stage

When the time comes:

| Milestone | Critical files to modify | Already in place? |
|---|---|---|
| 3 customers | `scripts/onboard-client.sh` (NEW), `website/index.html` for client-specific subdomains | Need to write |
| 10 customers | `src/usage_log.js` (NEW), modify all 4 `askClaude()` callsites | Token tracking not yet built |
| 20 customers | `migrations/006_multitenant.sql` (NEW), `src/db.js` (massive), `src/server.js` (tenant middleware), `src/integrations/google.js` (drop singleton) | None of this is done |
| 50 customers | `src/billing.js` (Stripe), `src/jobs/queue.js` (BullMQ), `src/usage_caps.js` | None |
| 100 customers | Public API routes, Postgres replication config, Stripe Customer Portal integration | None |

---

## Verification

This roadmap is "verified" if:

1. **At each milestone, costs as % of revenue stay below 60%.** If hosting/Anthropic eats >60% of MRR, your pricing is wrong, not your infra.
2. **Time-to-onboard a new customer decreases at each milestone:**
   - 1 customer: 90 min manual
   - 10 customers: 15 min via script
   - 100 customers: 5 min self-service signup
3. **You stop firefighting at each milestone.** If you're up at 2am at 50 customers, you skipped a step (probably observability or background jobs).

---

## What this plan is NOT

- A guarantee. Customer mix changes everything (chain businesses with 10 locations are very different from single-shop salons).
- An implementation plan. It's a strategy doc. Specific implementation plans live alongside `migrations/` and feature branches.
- A pitch. The numbers above are operating costs, not unit economics or a financial model. For investors, you'd build a real model on top of these constraints.
