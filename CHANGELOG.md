# Changelog

All notable changes to this project. Entries are in reverse chronological order (newest first). Each entry lists what changed and which files to look at if a regression appears.

## 2026-05-10 — Rough homepage scaffold at /homepage/

### Added
A minimal, iterable homepage scaffold with the layout the user specced (logo top-left, embedded chat in the hero, 5 nav links to their own pages). Explicitly "rough" — not a polish job; meant to be replaced when the real UI/UX files arrive.

- [public/homepage/index.html](public/homepage/index.html) — Hero with the gradient headline and an `<iframe src="/">` embedding the customer chat directly on the page so visitors can try the demo without leaving.
- [public/homepage/about.html](public/homepage/about.html), [services.html](public/homepage/services.html), [contact.html](public/homepage/contact.html), [join.html](public/homepage/join.html) — placeholder content for the four nav targets. Each has a yellow "Placeholder content" warning banner so they're obviously stubs.
- [public/homepage/homepage.css](public/homepage/homepage.css) — single shared stylesheet (~150 lines). Sticky header, nav with active-state, hero, page-wrap layout, mobile breakpoint at 720px.
- Every page has the same nav block: Home / About / Services / Contact / Join + a separate "Business sign in" pill that links to `/login.html`.

### Why /homepage/ and not /
- `/` is currently the customer chat, which is referenced by the WhatsApp webhook handler, the dashboard's preview links, the marketing site's iframe widget, and any future per-tenant embeds. Replacing `/` with a marketing homepage would break all of those silently.
- `/homepage/` is a clean test path that doesn't collide with anything.
- When you're ready to swap, it's a 10-line change in [src/server.js](src/server.js) static-file routing — but that's a deliberate decision for later.

### Known issues / things to watch
- **The embedded chat iframes `/`** (the customer chat). Visitors to the homepage will be chatting with the demo "Dr. Smith Dental Clinic" bot. Fine for testing layout; obviously needs to point at a per-tenant configuration once multi-tenant lands.
- **No JS** — every page is static HTML. No form handlers wired (Contact and Join just show placeholder text).
- **Nav block is duplicated across 5 HTML files** by design (no template engine for "rough"). When the real design lands, the cleanest move is either a shared `<header>` partial included via JS fetch, or a build step.
- **Brand fonts** — uses system font stack. The polished `website/` site at the project root uses Syne + DM Sans; this scaffold doesn't. Match later if needed.
- **Not the same as `website/`** — this is a separate, simpler scaffold. The 6-page polished site at [website/](website/) (deployed via Cloudflare Pages) is unaffected.

### Rollback notes
- Delete the entire `public/homepage/` directory. No code outside that directory references it; nothing breaks.

---

## 2026-05-10 — Role-based separation between business_owner and founder dashboards

### Added
- **`role` column on `users` table** (migration [migrations/006_user_roles.sql](migrations/006_user_roles.sql)). Values: `'business_owner'` or `'founder'`. Existing users default to `'business_owner'`.
- **`FOUNDERS` env var** for seeding the 5 founder accounts. Format: `alice:apass,bob:bpass,...`. Idempotent — usernames already in `data.db` are skipped (passwords NEVER overwritten on re-run). New helper `seedFoundersFromEnv()` in [src/db.js](src/db.js).
- **Two role-aware middlewares** in [src/auth.js](src/auth.js): `requireBusinessOwner` and `requireFounder`. Wrong-role HTTP requests get 403 (`/api/*`) or a 302 redirect to the user's own dashboard (HTML pages). The old `requireAuth` still exists but is no longer used by route handlers — kept for any external callers.
- **Login API now returns the user's role**, and [public/js/login.js](public/js/login.js) redirects to `/operator.html` for founders and `/admin.html` for business owners.

### Changed
- **`/admin.html`** is now gated by `requireBusinessOwner` (was `requireAuth`). Founders trying to open it get redirected to `/operator.html`.
- **`/operator.html`** is now gated by `requireFounder` (was `requireAuth`). Business owners trying to open it get redirected to `/admin.html`.
- **Every `/api/*` route in [src/server.js](src/server.js)** has had its middleware swapped:
  - `/api/operator/*` (5 routes: overview + clients CRUD) → `requireFounder`
  - All other `/api/*` admin endpoints (~30 routes: business config, profiles, bookings, documents, integrations, metrics, escalations, unanswered, usage, email outbox, etc.) → `requireBusinessOwner`
- **Cross-links between dashboards removed**:
  - "Founder view →" link removed from [public/admin.html](public/admin.html)
  - "→ Business dashboard" link removed from [public/operator.html](public/operator.html)
  - "Open dashboard →" link in operator's per-business list removed in [public/js/operator.js](public/js/operator.js) (was pointing at `/admin.html`, which founders no longer can access — would 302 to `/operator.html` confusingly)

### Why this matters
Per the user's strategic plan, founders (5 of us) and business owners are completely separate audiences. Founders see the god-view CRM at `/operator.html`, business owners see only their own dashboard at `/admin.html`. Neither side can see the other. Today everything is single-tenant so "the business owner" is one person; this becomes per-tenant when multi-tenancy lands.

### Known issues / things to watch
- **`FOUNDERS` env var is plaintext.** Anyone with read access to `.env` can see the founder passwords. Migrate to a password-reset / invite flow before deploying publicly. For laptop dev today, fine.
- **Idempotent seeder NEVER overwrites passwords.** If a founder forgets their password, changing the value in `FOUNDERS` does NOT update the DB. Either delete the row in `data.db` first, or build a password-reset flow (preferred). I'd build the reset flow before going to production.
- **No 2FA on founder accounts.** With operator-level access (full sales pipeline visibility, every business's data once multi-tenant lands), 2FA should be added before pitching.
- **Existing single user `owen` keeps `business_owner` role by default** (the migration's `DEFAULT 'business_owner'` clause). To make `owen` a founder instead, run: `UPDATE users SET role='founder' WHERE username='owen';` — or simply log in as one of the seeded `founder1`-`founder5` accounts.
- **Migration 006 + the dev DB had a special case during development** (the `ensureColumn` helper added the column before the migration ran, causing a duplicate-column error). Resolved by removing the `ensureColumn` and manually marking 006 as applied on the dev DB. Fresh installs will not hit this — the migration runs cleanly on a DB without the column.

### Rollback notes
- **DB**: `ALTER TABLE users DROP COLUMN role;` — SQLite supports this in 3.35+. Or simpler: leave the column, it's harmless without the auth code referencing it.
- **Auth**: in [src/auth.js](src/auth.js), delete `requireRole`, `requireFounder`, `requireBusinessOwner` and their export. Revert `attachUser` to the version without `role:`. Revert login response to not include `role`.
- **Server**: in [src/server.js](src/server.js), `replace_all` `requireFounder` → `requireAuth` and `requireBusinessOwner` → `requireAuth`. Revert the static gate block to a single `requireAuth` for both pages. Restore the `seedAdminFromEnv` and remove the `seedFoundersFromEnv` import + call.
- **DB**: in [src/db.js](src/db.js), restore the original `seedAdminFromEnv` (without `role` in the INSERT) and the original `findSession` (without `u.role` in SELECT). Remove `seedFoundersFromEnv` and its export.
- **Login UI**: in [public/js/login.js](public/js/login.js), revert the conditional redirect back to `window.location.href = '/admin.html'`.
- **Cross-links**: re-add the "Founder view →" link in [public/admin.html](public/admin.html), the "→ Business dashboard" link in [public/operator.html](public/operator.html), and the `<a href="${b.adminUrl}">` in [public/js/operator.js](public/js/operator.js).
- **`.env`**: remove `FOUNDERS=` line (purely cosmetic — no harm leaving it).

---

## 2026-05-10 — `trust proxy` set to `loopback` for Cloudflare-tunnel compatibility

### Changed
- [src/server.js](src/server.js): added `app.set('trust proxy', 'loopback')` right after `const app = express()`.

### Why
- When the server is exposed via `cloudflared tunnel --url http://localhost:3000`, every request arrives with an `X-Forwarded-For` header. With `trust proxy` left at the Express default (`false`), `express-rate-limit` throws a `ValidationError` (non-fatal — requests still go through with status 200, but it spams stderr on every call). This made the WhatsApp setup logs unreadable.
- `'loopback'` is the safest setting for this topology: cloudflared connects to `127.0.0.1`, so the only proxy hop we trust is the loopback interface. We don't accept `X-Forwarded-For` from anywhere else.

### Known issues / things to watch
- If you ever put a non-loopback proxy in front of the server (e.g. nginx on a different host, a load balancer), this setting must change to match. `'loopback'` will silently ignore `X-Forwarded-For` from those proxies, so rate limits will key on the proxy IP instead of the customer.
- For Cloudflare *Pages* (not tunnel), trust setting needs to be `true` and you should additionally validate `CF-Connecting-IP` instead.

### Rollback notes
- Delete the single line `app.set('trust proxy', 'loopback');` in [src/server.js](src/server.js). The rate limiter goes back to producing the validation error on every tunneled request, but functionality is unaffected.

---

## 2026-05-09 — Marketing site: embed live Dunper chatbot as floating widget (0b78bdc)

### Added
- **Floating chat bubble (bottom-right)** on all 5 main marketing pages, injected by [website/js/common.js](website/js/common.js) so no per-page edits are needed. Click expands a 400×620 panel with an iframe pointing at `DEMO_URL`. Esc / X / backdrop closes.
- **8s timeout fallback** — if the iframe stalls or the tunnel is down, the panel shows an "open in new tab" link instead of staying empty.
- **Mobile** — panel goes fullscreen on screens ≤600px.
- Any element with `[data-dunper-open]` opens the panel. Wired the home-page hero CTA and the services-page CTA box.

### Changed
- **Home demo section** reframed as "Try it yourself" with a primary `data-dunper-open` button instead of an inline iframe.
- Lingering `contact@dunper.ai` → `dunperai@gmail.com` on home footer.

### Known issues / things to watch
- **`DEMO_URL` is hard-coded** in [website/js/common.js](website/js/common.js). When the Cloudflare quick tunnel rotates, every visitor hits a dead iframe — update the constant and re-deploy. Permanent fix: named tunnel.
- **Iframe sandbox** — uses default browser sandbox. If you ever load untrusted content there, tighten `<iframe>` attributes.

### Rollback notes
- Revert the changes in [website/js/common.js](website/js/common.js) (the floating-bubble code is additive — search for `data-dunper-open` and the `createChatPanel` block).
- Revert the small `data-dunper-open` button additions in [website/dunper_home.html](website/dunper_home.html) and [website/dunper_services.html](website/dunper_services.html).

---

## 2026-05-09 — docs: May 12 demo script (5a26ac0)

### Added
- [docs/demo-script.md](docs/demo-script.md) — 5-minute walkthrough: pre-demo checklist, 5-act flow (marketing site → customer chat → admin → operator → close), 3 likely investor questions with prepared answers, contingency plan for live-demo failures.

### Rollback notes
- Pure docs file. Delete [docs/demo-script.md](docs/demo-script.md) to revert. Zero code impact.

---

## 2026-05-09 — Backend hardening: graceful shutdown + Google retry (751aacd)

### Added
- **Graceful shutdown** in [src/server.js](src/server.js) — SIGTERM / SIGINT / uncaughtException handler drains in-flight HTTP requests, closes the SQLite handle, and force-exits after 10s if anything hangs. Prevents corrupt DB on Ctrl+C.
- **`withRetry()` wrapper** in [src/integrations/google.js](src/integrations/google.js) — exponential backoff on Google API 429 / 5xx and ECONNRESET-class errors. Auth errors (401/403) and other 4xx still fail fast (no point retrying a misconfigured account).

### Known issues / things to watch
- **10s force-exit ceiling**: if a request takes longer than 10s after shutdown signal, it gets killed mid-flight. For typical chat replies this is fine; long-running operations (e.g. uploading a huge document) could be cut off.
- **Retry budget**: `withRetry` defaults to 3 attempts. A flapping Google API can multiply latency by 3 before surfacing the failure to the caller.

### Rollback notes
- Remove the SIGTERM/SIGINT handler block at the bottom of [src/server.js](src/server.js).
- In [src/integrations/google.js](src/integrations/google.js), unwrap `withRetry(...)` calls back to direct Google API calls, and delete the `withRetry` helper function.

---

## 2026-05-09 — Marketing site: SEO meta tags, OG cards, sitemap, robots.txt (c83f995)

### Added
- Per-page `<meta name="description">` + canonical URLs on all 6 pages.
- Open Graph + Twitter card meta on all 6 pages so dunper.com previews render correctly when shared.
- `noindex` on [website/dunper_signin.html](website/dunper_signin.html).
- Static [website/sitemap.xml](website/sitemap.xml) and [website/robots.txt](website/robots.txt) for search engines.

### Changed
- Style the [website/index.html](website/index.html) redirect so first paint isn't a white flash.
- Fixed mismatched footer email on services page (`contact@dunper.ai` → `dunperai@gmail.com`).

### Rollback notes
- All changes are additive `<meta>` tags inside `<head>`. Revert each `website/dunper_*.html` to remove. Deleting `website/sitemap.xml` and `website/robots.txt` is harmless.

---

## 2026-05-09 — Marketing site: redesigned 6-page site (5d438d3)

### Added
Replaces the previous single-page landing with a 6-page user-designed multi-page site:
- [website/dunper_home.html](website/dunper_home.html) — hero with gradient text, animated orbs, fact strip (10K+ / 98% / 40+), 3-step "how it works", chat-bubble demo mockup.
- [website/dunper_about.html](website/dunper_about.html) — mission, 6 values, journey timeline, team cards.
- [website/dunper_services.html](website/dunper_services.html) — 6 feature cards, chatbot intelligence (6 settings), booking pipeline, 4 FAQs.
- [website/dunper_join.html](website/dunper_join.html) — 4-tier pricing (Starter/Pro/Max/Enterprise), monthly↔yearly toggle (yearly -20%), compare table.
- [website/dunper_contact.html](website/dunper_contact.html) — contact form, 4 contact-method cards.
- [website/dunper_signin.html](website/dunper_signin.html) — log in / sign up tabs, password match validation.
- [website/index.html](website/index.html) — meta-refresh redirect to `dunper_home.html`.
- [website/js/common.js](website/js/common.js) — shared nav-chatbar handler.

### Functional bits wired
- Contact form posts to `formsubmit.co/dunperai@gmail.com` via AJAX.
- Sign-up form posts to formsubmit.co (captures lead), redirects to `dunper_join.html`.
- Sign-in redirects to the live chatbot product (`DEMO_URL` in [website/js/common.js](website/js/common.js)).
- Pricing toggle math (monthly vs yearly, -20%).
- FAQ accordion (one open at a time).
- Nav chatbar persists question to sessionStorage, opens live demo.

### Removed
- Previous single-page [website/index.html](website/index.html) content (replaced with redirect).
- [website/css/style.css](website/css/style.css) (525 lines, replaced by per-page inline styles).
- [website/js/main.js](website/js/main.js) (replaced by [website/js/common.js](website/js/common.js)).

### Known issues / things to watch
- **`DEMO_URL` rotation** — same caveat as the chat widget: hard-coded in [website/js/common.js](website/js/common.js); update on every tunnel rotation.
- **`formsubmit.co` reliability** — third-party form relay. If it goes down, contact / sign-up forms silently fail (no fallback alert wired). Consider replacing with a real backend endpoint when going to production.
- **Brand fonts**: Syne (display) + DM Sans (body). Loaded from Google Fonts CDN. Offline previews will fall back to system fonts.

### Rollback notes
- The previous single-page site is recoverable from commit `60f1738`. To restore: `git checkout 60f1738 -- website/`.
- Cloudflare Pages is configured to serve `website/` as the output dir — reverting these files reverts the live site on next push.

---

## 2026-05-09 — Founder dashboard at /operator.html — businesses overview + sales CRM (6bca52b)

### Added
A god-view dashboard for the operator (you) separate from the business-owner-facing [public/admin.html](public/admin.html).

- **Aggregate snapshot tiles** — # of businesses on Dunper (1 today), total conversations, bookings, Anthropic spend, cache hit rate.
- **Per-business list** — name, type, hours, conversation/message/booking counts, conversion rate, monthly spend, open Qs / pending escalations. "Open dashboard" link to that business's `/admin.html`. Currently 1 row from singleton `business.json`; auto-populates when multi-tenant migration drops.
- **Sales pipeline** — manual CRM for tracking leads → demos → proposals → active customers.
  - New `sales_clients` table (migration `005_sales_pipeline.sql`).
  - Status pipeline tiles (Leads, Demos, Proposals, Active w/MRR, Lost).
  - "Upcoming next steps" panel — any prospect with `next_step_at` in next 14 days, sorted by date.
  - Full table view with click-to-edit modal.
  - Fields: business name, contact, vertical, status, plan, MRR, next step + date, free-form notes.
  - Standard CRUD endpoints under `/api/operator/clients`.
- Files: [public/operator.html](public/operator.html), [public/css/operator.css](public/css/operator.css), [public/js/operator.js](public/js/operator.js), [migrations/005_sales_pipeline.sql](migrations/005_sales_pipeline.sql), helpers added in [src/db.js](src/db.js), routes added in [src/server.js](src/server.js).

### Auth
- Same admin user gates both `/admin.html` and `/operator.html`. **No role separation yet** — when multi-tenant lands we'll split admin (per business) from operator (you, the platform).

### Known issues / things to watch
- **Singleton trap**: per-business list reads from `business.json` (one row). When you add a second business pre-multi-tenant, the operator dashboard will not show it correctly until DB schema gets `workspace_id`.
- **Anthropic spend column** depends on the usage-tracking commit (8c83066). If you revert that, this column shows blanks.
- **No CSV export** for sales pipeline — only in-app editing.

### Rollback notes
- Delete [public/operator.html](public/operator.html), [public/css/operator.css](public/css/operator.css), [public/js/operator.js](public/js/operator.js).
- In [src/server.js](src/server.js): remove the `/operator.html` and `/api/operator/*` routes.
- In [src/db.js](src/db.js): remove the `sales_clients` helpers (search for `salesClients` or `sales_clients`).
- The `sales_clients` table itself can stay in `data.db` harmlessly (or drop manually).

---

## 2026-05-09 — Anthropic usage tracking (8c83066)

### Added
Foundation for unit-economics modeling and per-customer cost capping later.

- **`anthropic_usage_log` table** ([migrations/004_anthropic_usage_log.sql](migrations/004_anthropic_usage_log.sql)) — per-call breakdown: `call_site`, `profile_id`, `model`, input/output/cache tokens, `cost_usd`.
- [src/config/claude.js](src/config/claude.js) `askClaude` now returns `{ text, usage }` instead of bare string. `estimateCost()` exported for direct callers (admin tool-use loop).
- **Cost calculation** uses Sonnet 4.6 retail pricing: `$3 / $15` input/output, `$3.75` cache create, `$0.30` cache read per 1M tokens.
- All 5 callsites wired:
  - `/chat` (web) → `call_site='chat'`
  - WhatsApp message handler → `call_site='whatsapp'`
  - Customer summary → `call_site='summarize'`
  - Conversation compaction → `call_site='compaction'`
  - Admin AI assistant → `call_site='admin_chat'` (new file [src/admin_chat.js](src/admin_chat.js))
- **`GET /api/usage`** returns: today/week/month/all-time spend, call counts, by-callsite breakdown, top 10 profiles by spend, cache hit rate.
- **"Anthropic API usage" card** on the dashboard ([public/admin.html](public/admin.html)) between Metrics and the alerts cards. Spend tiles + callsite/customer breakdown.

### Changed (BREAKING for any direct caller)
- **`askClaude` return shape changed**: was `string`, now `{ text, usage }`. All in-tree callers updated. If you have any external script that imports `askClaude`, it must be updated to read `.text`.

### Known issues / things to watch
- **Pricing is hard-coded**. If Anthropic changes Sonnet pricing, update the constants in [src/config/claude.js](src/config/claude.js) — historical rows in `anthropic_usage_log` will not be back-corrected.
- **`profile_id` is null for `admin_chat` callsite** (it's the operator, not a customer). Filtering by profile in the dashboard excludes these.
- **Token counts come from Anthropic's response `usage` object**. If Anthropic ever returns null, the row is logged with zeros (visible as $0.00 — looks like a free call but it wasn't).

### Rollback notes
- Revert [src/config/claude.js](src/config/claude.js) so `askClaude` returns bare string again.
- Update all 5 callsites: `/chat`, WhatsApp handler, summarize, compaction, admin chat — re-read `string` instead of `{text, usage}`.
- Delete [src/admin_chat.js](src/admin_chat.js) (extracted as part of this change).
- Drop the "Anthropic API usage" card from [public/admin.html](public/admin.html), and the matching JS block in [public/js/admin.js](public/js/admin.js).
- The `anthropic_usage_log` table can stay in `data.db` harmlessly.

---

## 2026-05-09 — docs: scaling roadmap from 1 to 1000 customers (8da956f)

### Added
- [docs/scaling-roadmap.md](docs/scaling-roadmap.md) — opinionated milestone plan grounded in a code audit. Confirms all 14+ DB tables are single-tenant (no `workspace_id`), `google_connection` has CHECK (id=1), all integration env vars are deployment-global, 4 `askClaude` callsites with no tenant attribution. Covers seven milestones (1, 3, 5, 10, 20, 50, 100, 1000) with architecture changes, monthly cost estimates, the forced inflection point at ~15 customers (multi-tenant rewrite), specific tool picks, and decisions to make NOW that affect downstream scaling.

### Rollback notes
- Pure docs file. Delete [docs/scaling-roadmap.md](docs/scaling-roadmap.md) to revert.

---

## 2026-05-09 — Marketing site: real headline + tighter copy (0d2e9ce)

### Changed
- [website/index.html](website/index.html) (the simple landing page from `60f1738`, before it was replaced by the 6-page redesign in `5d438d3`):
  - Headline: "Your AI receptionist. On duty 24/7."
  - Lede: replaced abstract "answers customer questions" with concrete channel-by-channel benefits (WhatsApp, website chat, Google Calendar, knowledge of menu/prices/policies).
  - Hero CTAs: "See it work" / "Book a demo".
  - Hero meta: surfaced 3 specific proof points (under an hour, EN+ID, no credit card).
  - Demo section title: "Try it. Book a fake appointment."

### Rollback notes
- Largely moot — `5d438d3` replaced this file entirely with the redesigned site. Listed for traceability only.

---

## 2026-05-08 (later) — Marketing site at /website (initial single-page) (60f1738)

### Added
- Single-page landing site at `website/`, plain HTML/CSS/JS, no build step.
- Sections: hero, 8 feature cards, 3-step how-it-works, live embedded demo iframe, 3-tier pricing (Starter / Pro / Max), demo-request form posting to `dunperai@gmail.com` via formsubmit.co, footer.
- Brand: purple/indigo gradient, same logo as chat. Mobile responsive at 720px / 580px.
- `window.DUNPER_DEMO_URL` set at top of `website/index.html` controls the iframe target.
- [website/README.md](website/README.md) walkthrough: Cloudflare Pages + GoDaddy DNS (nameserver swap, custom-domain attach, optional `hello@dunper.com` email forwarding).

### Known issues / things to watch
- **Superseded by 6-page redesign (5d438d3)** — this commit's `index.html`, `css/style.css`, and `js/main.js` were replaced. Listed here for completeness.

### Rollback notes
- To restore this single-page version: `git checkout 60f1738 -- website/`.

---

## 2026-05-08 (later) — Email confirmations, handoff, unanswered log, metrics dashboard, booking source (861a11a)

### Added
**Schema** ([migrations/003_metrics_handoff_email.sql](migrations/003_metrics_handoff_email.sql)):
- `bookings.source` column (default `'web'`; `'admin'` for owner-created; ready for `'whatsapp'` once Claude can book via WA).
- `escalations` table — customer "Talk to a human" requests.
- `unanswered_questions` table — AI fallback detection.
- `email_outbox` table — every confirmation send/skip/fail.

**Email** ([src/email.js](src/email.js)):
- Nodemailer transport built lazily from `SMTP_*` env vars (see [.env.example](.env.example)).
- `sendBookingConfirmation` runs async after every booking (web + admin paths).
- When SMTP not configured, still records to `email_outbox` as `status='skipped_no_smtp'` so the owner sees what would have sent.
- HTML + text templates with business name, service, date/time.

**Human handoff:**
- 👤 button in customer chat header ([public/index.html](public/index.html), [public/js/chat.js](public/js/chat.js)).
- `POST /api/customer/escalate` creates an escalation row.
- Dashboard "Customers waiting for an agent" panel lists open ones with a Mark resolved button (notes optional).
- i18n strings: `askHuman`, `handoffSent`, `handoffFailed` (EN + ID) in [public/js/i18n.js](public/js/i18n.js).

**Unanswered question detection:**
- 7 regex patterns spot uncertainty phrases ("I'm not sure", "please call", "outside what", etc.) in Claude's reply.
- Logged automatically with the customer's question for review.
- Dashboard panel shows open ones with Mark reviewed button.

**Metrics dashboard:**
- `GET /api/metrics` aggregates from existing tables.
- Shows: conversations, customer messages, conversion rate, bookings today/week/month, top service (last 30d), booking source mix, sentiment breakdown, open escalations, open unanswered, cancelled.
- Renders as a grid of metric cards in the new Metrics card on [public/admin.html](public/admin.html).

**Email outbox panel:** every confirmation email with status (sent/failed/skipped_no_smtp), color-coded.

**Logo asset**: [DunperAI-Logo.png](DunperAI-Logo.png) added at repo root.

### Known issues / things to watch
- **SMTP credentials live in `.env`**. If you commit `.env` you leak credentials. `.gitignore` already excludes it.
- **Regex-based unanswered detection** is heuristic. Will miss novel hedging phrases and will false-positive on Claude saying "I'm not sure" idiomatically. Review the panel before trusting it.
- **Escalation has no notification** — owner only sees it on the dashboard. No SMS/email alert to the owner when a customer escalates. Worth adding.
- **`source='whatsapp'`** is reserved but never written today (Claude can't book via WhatsApp yet).

### Rollback notes
- Migration 003 created the new tables — they can stay; the code that writes to them just disappears on revert.
- Delete [src/email.js](src/email.js) and remove the `sendBookingConfirmation` call sites in [src/server.js](src/server.js) (search `sendBookingConfirmation`).
- Remove the `/api/customer/escalate`, `/api/escalations*`, `/api/unanswered*`, `/api/metrics` route handlers in [src/server.js](src/server.js).
- Remove the Metrics, Escalations, Unanswered, and Email outbox cards in [public/admin.html](public/admin.html) and the matching code in [public/js/admin.js](public/js/admin.js).
- Remove the 👤 button in [public/index.html](public/index.html) and the handler in [public/js/chat.js](public/js/chat.js).

---

## 2026-05-08 (later) — Conversation compaction (89d81f1)

### Added
Keeps token cost flat over long chats. When a customer's stored history crosses **30 messages**, older messages roll into a single summary paragraph (≤150 words) and only the **last 10 messages** are sent verbatim to Claude. The summary is injected as a synthetic `[user, assistant]` pair at the start of the prompt.

- New `conversation_compactions` table ([migrations/002_conversation_compactions.sql](migrations/002_conversation_compactions.sql)) — one row per profile, stores summary + last covered message id.
- [src/conversation.js](src/conversation.js) — `buildBaseMessagesForClaude` (used by both `/chat` and the WhatsApp handler), `shouldCompact`, `compactConversation`, `maybeCompactInBackground`.
- Compaction runs **async via `setImmediate`** after the chat reply, so user-facing latency is unaffected. First turn that crosses the threshold sends the full history once; every turn after uses the compaction.
- **Re-summarization** triggers when more than 30 messages have arrived since last compaction (folds the previous summary in).
- Image attachments referenced in compacted messages are described briefly in the summary ("shared photo of broken filling").

### Known issues / things to watch
- **Summary loss of detail** — by definition the summary drops information. If a customer mentioned a specific allergy in message 5 of a 35-message chat, the summary may not include it. Test with realistic conversations before trusting in clinical / legal contexts.
- **Compaction is best-effort.** If the summarization API call fails, the compaction is skipped silently — next chat turn just sends the full long history (more expensive but functional).
- **Threshold (30 / 10) is hard-coded.** If your chats run shorter / longer naturally, tune in [src/conversation.js](src/conversation.js).

### Rollback notes
- Delete [src/conversation.js](src/conversation.js).
- In [src/server.js](src/server.js): replace `buildBaseMessagesForClaude` calls with the original direct `getMessagesForProfile` reads, and remove `maybeCompactInBackground` calls.
- In [src/db.js](src/db.js): remove the `conversation_compactions` helpers.
- Migration 002 table can stay — harmless if unused.

---

## 2026-05-08 (later) — Backend hardening: prompt caching, rate limiting, dedup, backups, route split, migrations (208a104)

### Added
- **Prompt caching** — uploaded business docs and the system prompt are marked with `cache_control: { type: 'ephemeral' }` in [src/config/claude.js](src/config/claude.js). Document-grounded chats now cost ~10% on cache hits (5-minute TTL).
- **Rate limiting** (`express-rate-limit` package added):
  - `/chat`: 30 messages/min per customer cookie (or IP for non-cookied).
  - `/webhooks/whatsapp`: 200/min total.
  - `/api/*` (admin and customer): 120/min global ceiling.
- **WhatsApp dedup** — Meta retries the same `messageId` on transient failure. New `processed_wa_messages` table tracks every messageId; we skip on replay. 7-day TTL via `purgeOldWhatsAppMessages` on startup.
- **Daily SQLite backup** — [src/backup.js](src/backup.js) schedules `db.backup()` every 24h to `backups/` (gitignored), keeps last 7 days, prunes older. First backup runs 60s after startup.
- **Migrations system** — [src/migrations.js](src/migrations.js) scans `migrations/*.sql`, applies pending ones in a transaction, records in `schema_migrations`. Existing schema stays in [src/db.js](src/db.js) for now via `CREATE IF NOT EXISTS`; future schema changes go in numbered `.sql` files. Initial baseline at [migrations/001_baseline.sql](migrations/001_baseline.sql).
- **Routes extracted** — [src/routes/webhooks.js](src/routes/webhooks.js) now owns the WhatsApp webhook endpoints. Server mounts via `createRouter({ webhookLimiter, handleWhatsAppPayload })`. Admin/customer routes stay in `server.js` for this round.

### Changed
- New `.env` knobs documented in [.env.example](.env.example).
- [.gitignore](.gitignore): adds `backups/` and related.

### Known issues / things to watch
- **Rate-limit IP behavior**: behind a tunnel/proxy, `req.ip` may be the proxy's IP. If multiple customers share an IP (NAT), they share the budget. Trust-proxy is not configured by default — set `app.set('trust proxy', ...)` if you deploy behind a CDN.
- **Backup destination is local**. `backups/` is on the same disk as `data.db` — disk failure loses both. For real DR, copy to S3/R2/Drive.
- **Cache TTL is 5 minutes**. Customer who comes back 6 minutes later pays full price for the system prompt. Acceptable for chat workloads.
- **Migrations runner is forward-only** — no down migrations. To roll back a schema change you must hand-write SQL.

### Rollback notes
- Remove `cache_control` blocks in [src/config/claude.js](src/config/claude.js) (search `ephemeral`).
- Remove `express-rate-limit` import + the three limiters in [src/server.js](src/server.js); `npm uninstall express-rate-limit`.
- Remove `processed_wa_messages` checks in [src/routes/webhooks.js](src/routes/webhooks.js) (or revert that file to inline back into `server.js`).
- Delete [src/backup.js](src/backup.js) and the call to it at server startup.
- Delete [src/migrations.js](src/migrations.js) and the runner call at startup. The `migrations/` directory and `schema_migrations` table can stay harmlessly.
- Move WhatsApp webhook routes back into [src/server.js](src/server.js); delete [src/routes/webhooks.js](src/routes/webhooks.js).

---

## 2026-05-08 — WhatsApp Cloud API auto-reply

### Added
- **Bidirectional WhatsApp** via Meta's official Cloud API. Customers messaging your WhatsApp Business number now get auto-replies from Claude, with the same system prompt + business config the web chat uses.
  - File: [src/integrations/whatsapp.js](src/integrations/whatsapp.js).
- **`GET /webhooks/whatsapp`** — Meta's verification handshake. Validates `WHATSAPP_VERIFY_TOKEN` and echoes the challenge back.
- **`POST /webhooks/whatsapp`** — receives inbound messages. Verifies HMAC SHA-256 signature against `WHATSAPP_APP_SECRET` if set. Returns 200 immediately, then handles the message asynchronously so Meta's 5-second timeout never trips.
- **Conversation persistence:** WhatsApp conversations write into the existing `customer_messages` table, keyed by a synthetic `session_id = wa:<phone>`. They get the customer's phone auto-filled on first message.
- **Dashboard tagging:** customer rows now show a green "WhatsApp" tag (or blue "Web") so owners see which channel a conversation came from at a glance.
- **WhatsApp Integrations panel** on the dashboard — shows configuration status and the exact webhook URL to paste into Meta.
- **Step-by-step setup doc** at [docs/whatsapp-setup.md](docs/whatsapp-setup.md) covering: Cloudflare quick tunnel, Meta app creation, test number, access tokens, webhook configuration, recipient whitelisting, common errors, and the production upgrade path (permanent token, real business number, named tunnel).
- New `.env` knobs: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.

### Changed
- `express.json()` now captures the raw request body on `req.rawBody` (used for HMAC verification of WhatsApp webhooks).

### Known issues / things to watch
- **Test number = 5 recipients max.** Meta's free test number only delivers to whitelisted phones. For real customers you need a Meta-approved business number.
- **Temporary access tokens expire in 24h.** You'll see "Error validating access token" in server logs after a day. Switch to a System User Token (instructions in setup doc).
- **No image / voice / document handling yet.** WhatsApp customers sending images currently see a log line `[WhatsApp] ignoring non-text message` and get no reply. Add multimodal handling later if needed.
- **No human handoff.** Every customer message gets an auto-reply. If a customer says "let me speak to a human", Claude will *talk about* doing that but won't actually escalate. We could wire a Slack/email notification for "I want a human" detection.
- **Web chat ≠ WhatsApp same-customer continuity.** Right now if Sarah chats on the web, then later WhatsApps the business, those are two separate profiles in the dashboard. We could merge them via phone number — small change, ask if you want it.
- **Quick tunnel URL changes on every restart.** Re-verify the webhook in Meta whenever you restart cloudflared, or use a named tunnel with a stable subdomain.

### Rollback notes
- WhatsApp integration is fully isolated to `src/integrations/whatsapp.js` and the two webhook routes + `handleWhatsAppPayload` function in `src/server.js`. Deleting those reverts cleanly. Existing WhatsApp customer profiles remain in the DB harmlessly.

---

## 2026-05-08 (later) — Google Calendar/Sheets sync, WhatsApp button, chat-form polish

### Added
- **Google Calendar + Sheets integration** (optional — gracefully no-ops when not configured).
  - On every new booking: server creates a Calendar event AND appends a row to a "Bookings" tab in your Google Sheet.
  - On booking + AI summary generation: server upserts a row in a "Customers" tab (keyed by phone number, so one row per real-world customer; gets updated as the AI summary, intent, and sentiment evolve).
  - Sheet tabs are auto-created with header rows on first use — no manual setup needed inside the sheet itself.
  - Auth uses the existing `ai-frontdesk-495621-c1c679e97a5c.json` service account (kept out of git).
  - Files: [src/integrations/google.js](src/integrations/google.js), wired in [src/server.js](src/server.js).
- **`/api/integrations/google` endpoint + admin Integrations panel** showing the service-account email (so the user knows what to share their Calendar/Sheet with), connection status, and configured Calendar/Sheet IDs.
- **WhatsApp click-to-chat** — when `whatsapp_number` is set in business config, a green WhatsApp button shows in the customer chat header. Tap → opens WhatsApp directly via `https://wa.me/<number>?text=<prefilled>`. No Meta Business API setup required (intentional — the real WhatsApp Business API needs Meta verification, message templates, weeks of approval; click-to-chat covers the actual customer-facing use case).
  - New optional fields: `whatsapp_number`, `whatsapp_prefill_message`.
  - Editable from the dashboard's new "WhatsApp" card.
- **Brand logo slot** in the customer chat — appears next to the message box where the send button used to be. Shows the `logo_url` image if set, otherwise a dashed "LOGO" placeholder. Editable from the dashboard's new "Branding" card.
- **Customer chat now reads `name` from business config** for the header title and tab title (so each client deployment looks branded without code changes).
- New `.env` knobs: `GOOGLE_CREDENTIALS_PATH`, `GOOGLE_CALENDAR_ID`, `GOOGLE_SHEET_ID`.

### Changed
- **Send button moved INSIDE the input field** (right edge of the input, with rounded-icon style). The standalone send button slot was repurposed as the brand logo slot.
- **Booking + customer endpoints** now also push to Google in the background (non-blocking — the chat UI gets its response immediately even if Google is slow or down).

### Setup steps the user must do AFTER deploying
For Google integration to actually do anything:
1. Open the service-account JSON in `ai-frontdesk-495621-c1c679e97a5c.json` and copy the value of `client_email` (it's also shown in the dashboard Integrations panel).
2. In Google Calendar: Settings → Share with specific people → add the service-account email with "Make changes to events" permission. Note the calendar's ID (or just use `primary`).
3. Create a Google Sheet (any blank one). Click Share, add the service-account email as Editor. Copy the sheet ID from the URL (between `/d/` and `/edit`).
4. Set `GOOGLE_CALENDAR_ID` and `GOOGLE_SHEET_ID` in `.env`. Restart server.
5. Hit Refresh in the dashboard Integrations panel — both pills should turn green.

### Known issues / things to watch
- **Calendar timezone:** events use the booking's stored ISO timestamp, which is in server-local time. If the server runs in a different timezone than the business, calendar events may show at the wrong wall-clock time. Same caveat as before — fine for single-laptop deployments.
- **Sheets writes are best-effort:** Calendar/Sheets failures are logged to the server console and silently swallowed for the user (booking still succeeds). If a sheet is missing or auth expires, no in-app error is surfaced — check server logs.
- **Customer dedup uses phone column:** the upsert logic keys on phone number. If a customer changes their phone number you'll get a duplicate row. Acceptable tradeoff for v1.
- **WhatsApp number format:** must be international, no `+` or spaces (e.g. `6281234567890`). The form hint says this. Bad formats produce a broken `wa.me` URL.
- **No outbound WhatsApp messaging.** Click-to-chat is one-way — customer initiates. If you need automated outbound (booking confirmations sent via WhatsApp from a verified business number), that's a separate effort using the real Meta WhatsApp Business Cloud API.

### Rollback notes
- Google integration is fully isolated to `src/integrations/google.js`. Removing the four `googleIntegration.*` calls in `src/server.js` and reverting the env additions cleanly removes it. Existing bookings stay in SQLite.
- The chat-form layout change is contained to a new `<div class="input-wrap">` wrapping the input + send button, plus the new `.brand-logo` div. Reverting `public/index.html` and the modified CSS rules in `public/css/style.css` restores the old three-column layout.
- WhatsApp button reverts cleanly by removing the `<a id="whatsapp-link">` element and the `loadBusinessBranding` block in `public/js/chat.js`.

---

## 2026-05-08 — Bookings, AI customer summary, customer/owner page split

### Added
- **Customer-facing booking modal** with date picker and live time-slot grid.
  - Opened by the new "Book" button in the chat header.
  - Files: [public/index.html](public/index.html), [public/js/booking.js](public/js/booking.js), [public/css/style.css](public/css/style.css) (modal + slot styles).
- **Slot-availability engine** that respects business hours, service duration, 24-hour advance-notice rule, and existing bookings (no double-booking).
  - Defaults: Mon–Fri 9:00–17:00, 30-minute slot intervals, max 30 days ahead. Closed Sat/Sun.
  - Override per-day with optional `business.hours_structured` field in `business.json`.
  - File: [src/bookings.js](src/bookings.js).
- **Bookings persistence** in SQLite (`bookings` table — id, profile_id, customer_name, customer_phone, service_name, duration_minutes, starts_at, ends_at, status, notes).
  - Schema + helpers (`createBooking`, `listBookings`, `listBookingsForProfile`, `listBookingsBetween`, `cancelBooking`, `getBookingById`).
  - File: [src/db.js](src/db.js).
- **Booking API endpoints**:
  - `GET  /api/customer/business`     — public (services list for the booking form).
  - `GET  /api/customer/availability` — public (slots for date + service).
  - `POST /api/customer/bookings`     — public (create booking; auto-fills customer profile name/phone if blank).
  - `GET  /api/customer/bookings`     — public (the current customer's own bookings).
  - `GET  /api/bookings`              — admin (all bookings).
  - `POST /api/bookings/:id/cancel`   — admin.
  - File: [src/server.js](src/server.js).
- **Bookings panel on the admin dashboard** — date/time, service, customer, phone, with a Cancel button.
  - Files: [public/admin.html](public/admin.html), [public/js/admin.js](public/js/admin.js), [public/css/admin.css](public/css/admin.css).
- **AI-generated customer summaries** — per-customer "Generate" button that calls Claude to extract a short summary, intent label, and sentiment tag. Persisted in `customer_summaries` (one row per profile, upserted).
  - Endpoints: `POST /api/profiles/:id/summarize`, `GET /api/profiles/:id/summary`.
  - Files: [src/server.js](src/server.js), [src/db.js](src/db.js), [public/js/admin.js](public/js/admin.js), [public/css/admin.css](public/css/admin.css).

### Changed
- **Customer chat page no longer links to the admin dashboard.** The ⚙ icon → /admin.html was a privacy hole; replaced with the customer-facing "Book" button.
  - File: [public/index.html](public/index.html).
- **Booking confirmations appear inline in the chat** as an assistant message after a successful booking, via `window.appendBookingConfirmation`.
  - File: [public/js/chat.js](public/js/chat.js).

### Known issues / things to watch
- **Timezones:** booking start/end times are stored as ISO UTC strings derived from server-local time. As long as the server and customers are in the same timezone (typical single-business deployment) display is correct everywhere. Cross-timezone deployments would need an explicit "business timezone" config.
- **Service rename breaks linkage:** bookings store `service_name` as a string, not a foreign key. If you rename a service in business.json after bookings exist, old bookings keep the old name (this is intentional — historical accuracy — but worth knowing).
- **Calendar integration is still SQLite-only.** Google Calendar sync (Day 4 in the original plan) hasn't been wired yet. If the business owner manages availability outside this system, those external bookings won't appear in the slots logic.
- **Default hours assumption:** if `business.hours_structured` is missing, the engine assumes Mon–Fri 9–5. A salon open Saturday won't see Saturday slots until that field is added to `business.json`.

### Rollback notes
- Booking-related code is isolated to `src/bookings.js`, the bookings/customer_summaries tables, and the modal in the customer/admin frontends. Reverting this commit restores the pre-booking app cleanly. The `data.db` file would still have the `bookings` and `customer_summaries` tables (harmless — just unused).
- The customer page admin-link removal is a one-line diff in `public/index.html` and the new Book button — easy to revert if needed.

---

## 2026-05-07 — Initial public commit (deployed via friend's Stage 1–3b work)

Captured by the existing GitHub commit history (`Initial frontdesk AI chatbot` + Stage 1b/2/3a/3b). Highlights from those:
- Express server, `/chat` endpoint, conversation history per customer profile.
- Auth (cookie sessions, bcrypt), admin login at `/login.html`.
- AI assistant inside the dashboard that edits `business.json` via tool use.
- Business config version log + restore.
- Knowledge documents upload (PDFs/text the customer chatbot reads).
- Customer image attachments (Claude vision).
