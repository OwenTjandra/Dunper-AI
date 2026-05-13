# Mac mini scaling plan

How to grow Dunper from 1 customer to 200+ on Mac mini hardware before
considering cloud. Complements `scaling-roadmap.md` — that doc covers
the architectural pivots (single-tenant → multi-tenant); this one is
Mac mini-specific, with hardware purchases, cron jobs, and the exact
order of operations.

The plan is staged so that **each phase pays for the next**. You buy
Mac mini #1 with revenue from the first 3 customers. You buy Mac mini
#2 when you cross 15. You never have to put money in.

---

## Phase 0 — Now (1 customer, on laptop)

- 1 customer (yourself: Dunper AI's own deployment at dunper.com)
- Running on your laptop with `node src/server.js` + Cloudflare Tunnel
- All work is single-tenant per the `scaling-roadmap.md` design

**What's wrong:**
- Laptop closes → site goes down
- WhatsApp webhooks miss when laptop sleeps
- Cron jobs (backups) only run when you're at the desk

**Cost:** $0/mo. **Revenue:** $0 (no paying customers yet).

**Exit trigger:** the day you sign your first paying customer.

---

## Phase 1 — Mac mini #1 (1-5 customers, ~$300-500 MRR)

The moment a real customer pays you, dunper.com cannot live on a laptop
anymore. Buy the Mac mini before your first paid customer goes live.

### Hardware
- **Mac mini M4 base, 16GB RAM, 512GB SSD** — $799 / Rp 12M one-time
  - Why 16GB: handles up to 50 single-tenant instances on RAM
  - Why 512GB: SQLite DBs grow fast; 256GB will pinch within 6 months
  - Why M4 base (not Pro): you're I/O-bound, not CPU-bound

### Setup tasks (one-time, ~1 day total)
1. Restore Time Machine / fresh install macOS, enable FileVault
2. Install Node 20, git, sqlite3 CLI, cloudflared, tailscale
3. Clone `Dunper-AI` repo to `/Users/owen/Documents/Dunper-AI`
4. Copy `.env` from laptop (NOT git-tracked)
5. `npm install`
6. Create launchd plist `~/Library/LaunchAgents/com.dunper.server.plist`
   that runs `node src/server.js` and restarts on crash
7. Create launchd plist for `cloudflared tunnel run dunper`
8. Migrate `data.db` from laptop → Mac mini (rsync)
9. Update DNS / Cloudflare named tunnel to point to Mac mini
10. Install Tailscale → SSH from anywhere
11. Disable display sleep, disable system sleep, allow auto-restart after power failure
12. Set up automatic macOS updates (skip major version, allow security patches)

### Per-customer onboarding (manual at this stage)
For customers 1-5, manual onboarding is fine. ~15 min per customer:
1. Pick a subdomain: `{slug}.dunper.com`
2. Add a Cloudflare DNS CNAME → your tunnel
3. Add the hostname route in tunnel config
4. Copy a base `business.json` template, edit for the customer
5. `npm install && node src/server.js` on a new port (e.g., 3001, 3002...)
6. Customer signs in via dashboard, sets up business config via Setup Assistant

### Cost
- Hardware: $799 one-time
- Internet: existing home connection
- Anthropic API: ~$5-15/customer/mo
- Domains: $0 (sub-domains under dunper.com)
- **Total ongoing: ~$25-75/mo for 5 customers**

### Revenue at this stage
- 5 customers × $20 Starter = $100/mo, OR
- 5 customers × $100 Pro = $500/mo (more realistic with the new pricing)
- Mac mini paid off in 2-8 months

### Exit trigger
Customer 5 is the inflection point. You'll feel:
- Onboarding starts to feel repetitive
- You forget which port maps to which customer
- A power outage scares you

That's the signal to move to Phase 2.

---

## Phase 2 — Operational tooling (5-15 customers, ~$500-1.5k MRR)

Same Mac mini. Build the automation that prevents you from drowning.

### Build tasks (3-5 evenings of work)

#### 2a. `scripts/onboard-client.sh` — ~1 evening
Single command that provisions a new customer instance:
```bash
./scripts/onboard-client.sh \
  --slug bellasalon \
  --port 3005 \
  --business-name "Bella's Salon" \
  --business-type "hair salon"
```
What it does:
- Generates a workspace directory: `~/dunper-workspaces/{slug}/`
- Copies `Dunper-AI` codebase as a symlink (saves disk + lets you patch all customers at once)
- Generates a starter `business.json` and `.env` for that customer
- Creates a launchd plist that runs that customer's instance on the chosen port
- Adds the Cloudflare Tunnel hostname route
- Triggers an admin signup email to the customer

#### 2b. Centralized monitoring — ~1 evening
- **UptimeRobot** (free): one HTTP monitor per customer subdomain (5-min check)
- Slack / email alert when any goes down
- Status page (free `status.dunper.com` via UptimeRobot public page)

#### 2c. Off-Mac-mini backups — ~1 evening
- **Cloudflare R2** (10GB free, then $0.015/GB) or **Backblaze B2** (10GB free)
- Cron job runs at 3am: tar each customer's `data.db` → upload with timestamp
- 30-day retention with lifecycle policy
- Tested restore drill once a month (real ops habit)

#### 2d. Per-customer monthly usage report — ~half evening
Build on the existing `getUsageSnapshot()` and `countBillableSessions()`:
- Script that runs the 1st of each month
- Computes per-customer: conversations, Anthropic cost, sessions
- Emails you a CSV (or posts to Slack)
- Helps you spot customers who are close to / over their cap

#### 2e. One-command "update all customers" — ~half evening
```bash
./scripts/deploy-all.sh
```
Pulls latest `main`, runs migrations, restarts every launchd-managed
customer instance. Critical because at 10 customers, manual updates eat
half a day each.

### Cost at 15 customers
- Hardware: still the original Mac mini #1
- Internet: existing
- Anthropic: ~$75-225/mo total
- UptimeRobot: $0 (free tier covers 50 monitors)
- R2/B2 storage: $0 (under free tier)
- **Total ongoing: ~$100-250/mo**

### Revenue at this stage
- 15 customers × avg $60 (mixed Starter+Pro) = ~$900 MRR
- After Anthropic: ~$675-825 net
- Plenty to fund Phase 3

### Exit trigger
You hit ~15 customers and start to feel:
- A 4-hour power outage would be catastrophic (you'd get 15 angry calls)
- You're checking UptimeRobot 10x per day
- One customer's bug eats a whole evening

That's when you buy Mac mini #2.

---

## Phase 3 — Mac mini #2 warm spare (15-25 customers, ~$1.5-3k MRR)

You now own enough $/mo to invest in redundancy.

### Hardware
- **Mac mini M4, 16GB, 512GB** — second one, $799 / Rp 12M
- Place at a different physical location: parents' house, co-founder's
  apartment, a friend with reliable power & internet

### What it does
- **Warm spare**: a `cron` job rsyncs `data.db` + repo from Mac mini #1
  every 5 minutes
- **Failover via Cloudflare**: switch the tunnel origin to Mac mini #2
  if #1 is down (manual flip, ~2 min during an outage)
- **Dev/test workload**: when not failing over, runs Codex / Claude
  Code agents for nightly audits, runs the monthly usage rollup, hosts
  a staging copy of Dunper for testing new features

### Bonus: stop ops sucking up your weekends
Mac mini #2 lets you take a Sunday off without anxiety. That's worth
$799 alone.

### Cost
- Hardware: $799 one-time
- Internet at second location: usually existing
- Total ongoing: same as Phase 2, ~$100-300/mo

### Revenue at this stage
- 25 customers × avg $80 = ~$2,000 MRR
- After Anthropic + storage: ~$1,500-1,700 net

### Exit trigger
Customer 25-30. You'll feel:
- Even with all the automation, doing 30 separate deployments is gross
- Each Dunper upgrade requires 30 individual restarts and 30 sanity checks
- A schema change scares you

That's the signal to start Phase 4 — the multi-tenant rewrite.

---

## Phase 4 — Multi-tenant on Mac mini (25-150 customers, ~$3-15k MRR)

The big one. Same Mac mini hardware, but ONE Node process now serves
ALL customers. This is the architectural pivot that `scaling-roadmap.md`
flags as "the right choice past 20 customers."

### What changes in code (2-3 weeks of work, multi-PR)

1. **DB schema** — Add `workspace_id` to every customer-scoped table:
   `customer_profiles`, `customer_messages`, `bookings`, `escalations`,
   `unanswered_questions`, `customer_summaries`, `customer_attachments`,
   `conversation_compactions`, `anthropic_usage_log`, plus the singleton
   tables (`ai_settings`, `business_versions`, `google_connection`,
   `email_outbox`, etc.) lose their `CHECK (id = 1)` constraint.
2. **Workspace concept** — New `workspaces` table with `slug`, `name`,
   `owner_user_id`, `created_at`, `plan`, `monthly_cap`, etc.
3. **Per-workspace business.json** — Drop the file, replace with a
   `business_config` table keyed by `workspace_id`.
4. **Per-workspace integrations** — `google_connection`, WhatsApp WABA
   config, SMTP config all become workspace-scoped.
5. **Routing** — Server picks workspace by hostname (e.g.
   `bellasalon.dunper.com`) OR by URL path. Middleware sets
   `req.workspaceId`.
6. **Per-workspace AI settings** — `ai_settings` becomes a table keyed
   by `workspace_id`.
7. **Onboarding API** — `POST /api/workspaces` creates a new workspace
   in one DB transaction, sends a setup email. Replaces
   `onboard-client.sh`.
8. **Migration script** — Reads each Phase 2 customer's separate DB,
   merges into one big multi-tenant DB with `workspace_id` filled in.

### What stays the same
- Mac mini #1 still does the work (one Node process, much lighter than
  30 separate processes)
- Cloudflare Tunnel: still one tunnel, just routes hostnames to one
  origin instead of 30
- Mac mini #2: still warm spare, replicates the merged DB
- Same Anthropic API (eventually want per-workspace keys for clean cost
  attribution)

### Capacity ceiling on the same Mac mini
- Single-process Node serves thousands of concurrent connections
- SQLite handles ~10k+ writes/sec with WAL mode
- 150 customers × 30 convos/day × 5 turns = 22,500 LLM calls/day = 1
  call every ~4 seconds. Trivially handled.
- RAM usage: one Node process, ~500MB-1GB total. **Mac mini sips it.**

### Cost
- Hardware: still the same 2 Mac minis
- Internet: existing
- Anthropic: ~$750-2,250/mo total
- Storage: still under free tier
- **Total ongoing: ~$800-2,500/mo for 150 customers**

### Revenue at this stage
- 150 customers × avg $100 (Pro tier dominates) = ~$15k MRR
- After all costs: ~$12k+ net

### Exit trigger
Around customer 150-200, you'll feel:
- One Mac mini is doing the work of 30 servers — feels miraculous, also
  scary that one outage = 200 customers offline
- Anthropic Tier 2 starts to feel tight (you're at $400+/mo spend)
- Customers in Singapore / Manila / Bangkok complain about latency to
  your Jakarta home connection
- Compliance asks: "Where is the data physically stored?" — your home
  is not a satisfying answer for enterprise customers

---

## Phase 5 — Mac mini cluster (150-500 customers, ~$15-50k MRR)

Same architecture as Phase 4, but with 3-5 Mac minis sharing load.

### Hardware
- 3-5 Mac mini M4 16GB at different locations (your home, parents,
  co-founder, AWS Outposts colo if you want to get fancy)
- 1 Mac mini M4 Pro 32GB as the primary (~$1,399), the rest as workers
- Total: ~$4-6k one-time

### Architecture
- Primary Mac mini runs the main Node app + Cloudflare Tunnel
- Workers run async jobs: backups, monthly rollups, compaction summaries,
  Whisper transcription, embedding indexing
- All share one SQLite via Litestream replication to S3/R2, OR migrate to
  PostgreSQL hosted on the primary
- Tailscale connects them privately

### When to migrate from SQLite → Postgres
- 200+ concurrent writers becomes painful even with WAL
- Cross-Mac-mini coordination is easier with a real DB
- Per `scaling-roadmap.md`: this is the "promote SQLite to Postgres"
  moment

### Revenue at this stage
- 500 customers × avg $100 = ~$50k MRR
- After all costs: ~$40k+ net
- Investing in Mac minis still cheaper than equivalent cloud spend
  ($500/mo for 5 cloud servers = $6k/yr vs $4-6k one-time hardware)

### Exit trigger
**You're a real business now.** Around 500 customers, the calculus changes:
- Reliability concerns dominate cost concerns
- International latency matters (you have customers in 5+ countries)
- You want to sleep without checking UptimeRobot
- Investors / customers want a "real" hosting story

That's when you graduate from Mac minis to cloud. By that point, you'll
have $40k MRR funding it.

---

## Beyond Mac mini (500+ customers)

This is out of scope for this doc, but the path is:
1. Lift-and-shift the multi-tenant code to Hetzner / Railway / AWS
2. PostgreSQL Cloud (Neon, Supabase) instead of SQLite
3. Multi-region for latency (AWS ap-southeast-1 Singapore, ap-southeast-3 Jakarta)
4. Mac minis become dev/staging/internal tools forever

---

## Summary table

| Phase | Customers | Mac minis | Code | One-time | Ongoing | MRR | Net |
|---|---|---|---|---|---|---|---|
| 0 | 1 | 0 (laptop) | Current | $0 | $0 | $0 | $0 |
| 1 | 1-5 | 1 | Current single-tenant | $799 | ~$50/mo | ~$300 | ~$250 |
| 2 | 5-15 | 1 | + onboard-client.sh, R2 backups, UptimeRobot | $0 | ~$200/mo | ~$1,000 | ~$800 |
| 3 | 15-25 | 2 | + warm spare cron | $799 | ~$250/mo | ~$2,000 | ~$1,750 |
| 4 | 25-150 | 2 | **Multi-tenant rewrite** | $0 | ~$2,000/mo | ~$15,000 | ~$13,000 |
| 5 | 150-500 | 3-5 | + Litestream / Postgres | ~$4,000 | ~$6,000/mo | ~$50,000 | ~$44,000 |
| Cloud | 500+ | dev/staging | Lift to multi-region cloud | TBD | TBD | $60k+ | TBD |

**You self-fund every phase from the previous phase's revenue.**

---

## What to do this week

If you've signed your first paying customer or are close to it:

1. **Buy: Mac mini M4 16GB 512GB** ($799 / Rp 12M).
2. **Order it now** (Apple ships in 3-5 days in Indonesia).
3. While waiting, write `scripts/onboard-client.sh` so it's ready when
   the box arrives.
4. **Day Mac mini arrives**: spend a day doing the Phase 1 setup
   checklist above.
5. **Day after**: cut over dunper.com to Mac mini, retire the laptop
   instance.

That moves you from Phase 0 to Phase 1. Everything else follows from
customer growth.
