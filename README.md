# FrontDesk AI

An AI-powered chatbot frontdesk for local SMEs. Customers chat in the browser; Claude answers questions, helps with bookings, and surfaces business info — all configured per-client through a simple admin form.

## Stack

- **Backend:** Node.js + Express
- **AI:** Anthropic Claude Sonnet 4.6
- **Frontend:** Plain HTML/CSS/JS (no framework)
- **Config:** Single `business.json` file, editable in-browser at `/admin.html`

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key
cp .env.example .env
# then edit .env and paste your real sk-ant-api03-... key

# 3. Run the server
node src/server.js
```

Open http://localhost:3000 for the chat, or http://localhost:3000/admin.html to edit the business config.

## Project layout

```
frontdesk-ai/
├── src/
│   ├── server.js          Express server, /chat + /api/business endpoints
│   └── config/claude.js   Claude SDK wrapper
├── public/
│   ├── index.html         Chat UI
│   ├── admin.html         Business config form
│   ├── css/               Styles
│   └── js/                Frontend logic
├── business.json          Live business config (name, hours, services, rules)
├── .env                   API key (not committed)
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

## Roadmap

- [x] Day 1 — Server + Claude API connection
- [x] Day 2 — `/chat` endpoint with conversation history
- [x] Day 3 — Chat UI (message bubbles, typing indicator, mobile-responsive)
- [x] Day 3.5 — Per-business config + admin form
- [ ] Day 4 — Google Calendar integration + `book_appointment` tool
- [ ] Day 5 — Business dashboard (bookings, sentiment, customer log)
- [ ] Day 6 — Cloudflare Tunnel + PM2 for going live
- [ ] Day 7 — Demo polish
