<div align="center">

# Dunper AI

**An AI receptionist for small businesses.**
Always-on chat. Real bookings. 60+ languages. Built for Indonesian SMEs first.

[**Visit dunper.com →**](https://dunper.com)

</div>

---

## What it does

Dunper drops onto your website (or your WhatsApp Business number) and answers every customer who messages you — 24/7, in the language they're using, with knowledge of your hours, services, prices, and policies.

It books real appointments into your Google Calendar. It logs every customer to a dashboard you control. It hands off to a human the moment it doesn't know.

It's built for the 10-person warung in Surabaya whose owner has never heard the word "API," not the SaaS company with a developer ops team.

## What's in this repo

This is the **full product**:

| Path | What it is |
|---|---|
| `src/` | Node.js + Express server — chat API, admin API, auth, integrations |
| `public/` | Customer chat UI (`index.html`) + business dashboard (`admin.html`) + founder dashboard (`operator.html`) |
| `website/` | The marketing site at [dunper.com](https://dunper.com) — static HTML/CSS/JS |
| `scripts/` | Dev tools, including `seed-demo-data.js` for populating a realistic demo |
| `docs/` | Deploy runbooks, demo script, scaling plan |
| `migrations/` | SQL schema migrations |

## Tech

- **Node.js + Express** — single server, ~1k lines
- **SQLite** (`better-sqlite3`) — one `data.db` file holds everything
- **Anthropic Claude Sonnet 4.6** — the brain, with prompt caching for unit economics
- **Plain HTML/CSS/JS frontend** — no React, no build step
- **WhatsApp Cloud API** + **Google Calendar/Sheets OAuth** — real integrations, not stubs
- **Cloudflare Tunnel** — deploy from a laptop, no VPS required

## Quick start (local dev)

```bash
npm install
cp .env.example .env       # then edit: paste your Anthropic API key + admin creds
node src/server.js
```

Open:

| URL | What you see |
|---|---|
| http://localhost:3000 | Customer chat |
| http://localhost:3000/dunper_home.html | Marketing site |
| http://localhost:3000/admin.html | Business dashboard (after login) |
| http://localhost:3000/operator.html | Founder dashboard |
| http://localhost:3000/dunper_signin.html | Sign in / sign up |

The first run seeds an admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`. After that, manage users through the dashboard.

### Make it look alive (for a demo)

```bash
node scripts/seed-demo-data.js --reset
```

Populates 8 fake customers (with realistic Bahasa / English / Mandarin chats), 4 bookings, 5 sales pipeline prospects across stages, and 30 days of Anthropic usage history. Idempotent.

## Going live (dunper.com)

See [`docs/deploy-dunper-com.md`](docs/deploy-dunper-com.md). It's a Cloudflare Tunnel from your laptop to `dunper.com` — no VPS, free TLS, runs in 5 minutes.

For the marketing site as a static deploy on Cloudflare Workers, see [`wrangler.toml`](wrangler.toml).

## License

[Specify your license here — MIT, Apache 2.0, AGPL, or BUSL.]

## Contributing

We're a 5-person team building this in public, mostly out of Jakarta. If you spot a bug, file an issue. If you're an SME owner who'd try the beta, email **dunperai@gmail.com**.

---

## For developers — deeper docs

<details>
<summary>Project layout (click to expand)</summary>

```
frontdesk-ai/
├── src/
│   ├── server.js              Express server, routes, middleware
│   ├── business.js            Business config state + applyBusinessUpdate
│   ├── admin_chat.js          Admin AI assistant (tool-use for editing config)
│   ├── conversation.js        Customer chat history + compaction
│   ├── bookings.js            Availability + booking logic
│   ├── auth.js                Login/signup/2FA endpoints
│   ├── db.js                  SQLite schema + all DB helpers
│   ├── email.js               Lazy SMTP transport for confirmations
│   ├── mailer.js              2FA code emails
│   ├── migrations.js          Migration runner
│   ├── documents.js           Owner knowledge docs (PDF/text upload)
│   ├── config/claude.js       Anthropic SDK wrapper w/ prompt caching
│   ├── integrations/
│   │   ├── google.js          OAuth + Calendar + Sheets + retry logic
│   │   └── whatsapp.js        Cloud API webhook + sendText
│   └── routes/webhooks.js     WhatsApp + Meta webhook handlers
├── public/
│   ├── index.html             Customer chat UI
│   ├── admin.html             Business dashboard (login required)
│   ├── operator.html          Founder dashboard (founder role required)
│   ├── dunper_signin.html     (marketing site auth — symlink target)
│   ├── css/  js/  img/  uploads/
├── website/                   Static marketing site (deployed to dunper.com)
├── scripts/
│   └── seed-demo-data.js      Demo data populator
├── migrations/                Numbered SQL migrations
├── docs/
│   ├── deploy-dunper-com.md   Cloudflare Tunnel runbook
│   ├── demo-runbook.md        Click-by-click pitch demo script
│   ├── scaling-roadmap.md     1 → 1000 customer plan
│   └── whatsapp-setup.md      WhatsApp Cloud API setup
├── business.json              Live business config (gitignored)
├── data.db                    SQLite (gitignored)
└── .env                       Secrets (gitignored)
```
</details>

<details>
<summary>Architecture decisions</summary>

- **Single-tenant SQLite for now.** Multi-tenancy migration is planned around customer #15 — see `docs/scaling-roadmap.md`. The architecture is "shaped clay" until then.
- **Prompt caching aggressively.** The system prompt (business config + knowledge docs) gets `cache_control: ephemeral` on every call. 90%+ cache hit rate in steady state → cost per conversation drops to ~$0.005.
- **Conversation compaction.** Once a conversation hits 30 messages, the oldest are summarized into a single context block. Keeps token cost flat over long chats.
- **Tunnel-first deploy.** No VPS, no Docker, no Kubernetes — Cloudflare Tunnel from a laptop is enough for the first 100 customers. Scaling roadmap covers the migration to a real host when needed.
- **All UI is plain HTML.** Three independent surfaces (customer chat, business admin, founder operator) share styles via two CSS files. No SPA, no router, no build step.
</details>

<details>
<summary>Environment variables</summary>

See `.env.example` for the full list. Required for basic operation:
- `ANTHROPIC_API_KEY` — Claude API key
- `ADMIN_USERNAME` + `ADMIN_PASSWORD` — seeds the first business_owner user
- `PENDING_LOGIN_SECRET` — random 32-char string (for 2FA cookie HMAC)

Optional (enables corresponding features):
- `SMTP_*` — Gmail SMTP for booking confirmations + 2FA codes
- `GOOGLE_OAUTH_*` — Calendar + Sheets integration
- `WHATSAPP_*` — Cloud API webhook + outbound messages
- `FOUNDERS` — seeds founder accounts (access to operator dashboard)
</details>

<details>
<summary>Roadmap</summary>

- [x] Customer chat with conversation history
- [x] Business config admin dashboard
- [x] AI-assistant config editing (tool use)
- [x] Customer profiles + transcript review
- [x] Knowledge document upload (PDF + text)
- [x] Customer image attachments (Claude vision)
- [x] Google Calendar + Sheets sync
- [x] WhatsApp Cloud API integration
- [x] 2FA email-code sign-in
- [x] Founder dashboard with sales CRM
- [x] Marketing site at dunper.com
- [x] Self-service signup → real account → real dashboard
- [ ] Multi-tenant migration (`workspace_id` everywhere)
- [ ] Stripe billing
- [ ] Bahasa-language UI for the business dashboard
- [ ] QRIS / GoPay / OVO payment links in chat
- [ ] Multi-location support per business
</details>
