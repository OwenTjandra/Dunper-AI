# FrontDesk AI

An AI-powered chatbot frontdesk for local SMEs. Customers chat in the browser; Claude answers questions, helps with bookings, and surfaces business info — all configured per-client through a simple admin form.

## Stack

- **Backend:** Node.js + Express
- **AI:** Anthropic Claude Sonnet 4.6
- **Frontend:** Plain HTML/CSS/JS (no framework)
- **Storage:** SQLite (`data.db`) for users + sessions; `business.json` for live business config
- **Config:** Editable in-browser at `/admin.html` (login required)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key + admin credentials
cp .env.example .env
# then edit .env: paste your sk-ant-api03-... key
# and set ADMIN_USERNAME / ADMIN_PASSWORD (used to seed the first admin user)

# 3. Run the server
npm start
```

Open http://localhost:3000 for the chat, or http://localhost:3000/admin.html for the business dashboard (you'll be redirected to /login.html the first time).

The first time the server starts with no users in `data.db`, it seeds an admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. After that, changing those env vars has no effect — log in with the seeded credentials and (later) use the dashboard to change them.

## Testing on your local network

Other devices on the same Wi-Fi (your phone, another laptop) can hit the server too — useful for testing the chat on mobile without deploying anywhere.

On startup the server prints all reachable URLs, e.g.:

```
Local:  http://localhost:3000
LAN:    http://192.168.11.68:3000
Admin:  http://localhost:3000/admin.html
```

To allow inbound connections, open the port in the OS firewall once.

**Windows** (run PowerShell as Administrator):

```powershell
New-NetFirewallRule -DisplayName "FrontDesk Dev (TCP 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

**macOS** (for the Mac mini): System Settings → Network → Firewall → Options → allow incoming connections for `node`. Or disable the firewall on a trusted LAN.

> ⚠ **Security note:** the admin page now requires login, but the customer chat is fully open. Anyone on the same Wi-Fi can use the chat (which is the point) and that means consuming your API quota. The Windows rule above is scoped to the `Private` network profile so it won't apply on coffee-shop / airport Wi-Fi — confirm your home network is marked **Private** in Windows network settings.

## Project layout

```
frontdesk-ai/
├── src/
│   ├── server.js          Express server, routes, middleware wiring
│   ├── business.js        Business config state, validation, applyBusinessUpdate
│   ├── admin_chat.js      Admin AI assistant: tool definitions + tool-use loop
│   ├── auth.js            Login/logout endpoints + session middleware
│   ├── db.js              SQLite setup (users, sessions, business_versions) + seeds
│   └── config/claude.js   Claude SDK wrapper
├── public/
│   ├── index.html         Chat UI (open to all)
│   ├── login.html         Sign-in page for the dashboard
│   ├── admin.html         Business dashboard (login required)
│   ├── css/               Styles
│   └── js/                Frontend logic
├── business.json          Live business config (name, hours, services, rules)
├── data.db                SQLite database — users + sessions (gitignored)
├── .env                   API key + admin seed (gitignored)
└── package.json
```

## Configuring a new business

Either edit `business.json` directly or open `/admin.html` in the browser. The form has fields for:

- Name, type, hours, address, phone
- Services (name + duration + price, repeatable)
- Booking rules (free-text, repeatable)
- Tone of voice
- Fallback message for questions the AI can't answer

Saving from the admin form rebuilds the system prompt immediately — no server restart needed.

Every save is logged to the `business_versions` table in `data.db` with the username and timestamp. The dashboard's "History" panel lists them newest-first; click **Restore** on any earlier version to roll back. A restore is just another write, so it shows up in the log too — you can always undo it.

The "Edit with AI" panel at the top of the dashboard is a chat interface that can mutate the config via tool use. Type natural-language requests ("add a deep cleaning, Rp 750,000, 75 min", "drop the no-Sundays rule", "change our hours to Mon–Sat 8–6") and the assistant calls `update_business_field`, `add_service`, `update_service`, `remove_service`, `add_rule`, or `remove_rule` as appropriate. Each successful tool call goes through the same `applyBusinessUpdate` path as the form save, so the version log captures everything. Ambiguous requests trigger a clarifying question rather than a guess.

## Customers

Every customer browser gets a long-lived `frontdesk_customer` cookie on first chat. That cookie maps to a row in `customer_profiles`, and every message they exchange is stored in `customer_messages`. The customer chat sends just the new message text — the server reads the prior history from the database, so a page reload no longer loses the conversation.

The dashboard's "Customers" panel lists everyone who's chatted, newest activity first. Click a row to expand and read the full transcript. You can fill in the customer's name, phone number, and free-form internal notes — those don't go to the AI, they're just for you.

## Roadmap

- [x] Day 1 — Server + Claude API connection
- [x] Day 2 — `/chat` endpoint with conversation history
- [x] Day 3 — Chat UI (message bubbles, typing indicator, mobile-responsive)
- [x] Day 3.5 — Per-business config + admin form
- [x] Stage 1a — Admin auth wall (SQLite users + sessions, login page)
- [x] Stage 1b — Version log of business.json changes + restore UI
- [x] Stage 2 — AI assistant in the dashboard that edits business config via tool use
- [x] Stage 3a — Customer profiles + persistent conversation history (server-side, viewable in dashboard)
- [ ] Stage 3b — File uploads (customer images/docs + owner knowledge docs)
- [ ] Day 4 — Google Calendar integration + `book_appointment` tool
- [ ] Day 5 — Business dashboard (bookings, sentiment, customer log)
- [ ] Day 6 — Cloudflare Tunnel + PM2 for going live
- [ ] Day 7 — Demo polish
