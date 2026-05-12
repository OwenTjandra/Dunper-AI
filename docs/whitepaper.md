# Dunper AI

## An always-on AI receptionist for small businesses

**Whitepaper · May 2026 · Version 1.0**

Dunper AI Pte. Ltd. · Jakarta, Indonesia · dunper.com · dunperai@gmail.com

---

## Executive summary

Small service businesses lose customers every day because they cannot answer fast enough. A salon misses a booking inquiry on Instagram while the owner is mid-haircut. A dental clinic returns a voicemail four hours late and the patient has already gone elsewhere. A restaurant in Jakarta receives WhatsApp messages in Bahasa, English, and Mandarin all hour — with one person trying to answer them all.

Dunper AI is an always-on AI receptionist built specifically for these businesses. It answers customer questions, books appointments, qualifies leads, and escalates to a human when needed — in 60+ languages, 24 hours a day, across web chat and WhatsApp.

This whitepaper explains the problem we solve, how our system works, what makes it different from generic chatbots, the technical architecture behind it, our approach to data privacy, and the roadmap from a single working deployment today to a multi-tenant SaaS serving thousands of small businesses in Southeast Asia and beyond.

Dunper is currently live at **https://dunper.com** with one production deployment serving Dr. Smith Dental Clinic. The system has handled real customer conversations, booked real appointments via Google Calendar, and is approaching its first paid pilot customers.

---

## 1. The problem

### 1.1 Small businesses live or die on response time

Industry research consistently shows that 40–60% of inbound inquiries to small service businesses go un-answered or are answered late enough that the customer has already chosen a competitor. The reasons are mundane and unfixable through hiring more people:

- The owner is the only "customer service" person and is also actively serving customers.
- Messages arrive across at least three channels (phone, WhatsApp, Instagram, website chat) at unpredictable hours.
- A single owner cannot speak every language a multilingual market like Jakarta or Surabaya requires.
- The first hour after closing is the highest-volume hour for booking inquiries — and there's nobody there.

The cost is not abstract. For a salon that converts 80% of replied-to inquiries to actual bookings, every 100 unanswered DMs is 80 lost bookings. At an average revenue per visit of Rp 250,000, that is Rp 20,000,000 of lost revenue per month — for a business whose owner cannot afford to hire a full-time receptionist.

### 1.2 Generic chatbots are not the answer

For ten years, "chatbot" has meant either a rigid scripted FAQ widget bolted onto a website, or a generic LLM that hallucinates business details it does not actually know. Both fail the same way: the customer asks something specific — "do you have anything open Thursday?" — and the bot either says "I don't understand, please call us" or invents an answer that the business cannot honor.

A useful AI receptionist needs three things that off-the-shelf chatbots do not have:

1. **Real, structured knowledge of the specific business.** Hours, services, prices, booking rules, escalation paths — not scraped from a website but explicitly curated.
2. **Real action capability.** It must be able to book, not just describe how to book. It must read and write the same calendar the owner uses.
3. **Honest escalation.** When it does not know something, it must say so and route to a human. Not pretend.

### 1.3 The language problem

Indonesia alone has 700+ living languages. The practical reality in any urban service business is at least Bahasa Indonesia, English, Mandarin, and increasingly Spanish and Tagalog for remote-work clientele. A receptionist that only speaks one language is unusable in this market. Most existing chatbot products are English-first and treat other languages as a translation afterthought.

---

## 2. The Dunper AI solution

### 2.1 Product overview

Dunper AI is a fully-managed AI receptionist that:

- **Answers** customer questions about the business 24/7, in 60+ languages, with switching mid-conversation.
- **Books** appointments directly into the owner's Google Calendar, with real-time availability checks.
- **Qualifies** leads by asking the right follow-up questions and capturing contact info.
- **Escalates** clearly and immediately when it doesn't know — never hallucinating.
- **Lives** inside the channels customers already use: web widget on the business's own site, WhatsApp Business, and a hosted chat URL the business can share.

### 2.2 What makes Dunper different

Unlike generic chatbots:

| Generic chatbot | Dunper AI |
|---|---|
| Scripted FAQ tree | LLM with explicit, owner-curated business knowledge |
| "Please call us" when stuck | Escalates to a real teammate with full context |
| English-first, others bolted on | Multilingual by design, language switches mid-conversation |
| No calendar integration | First-class Google Calendar booking with conflict detection |
| Generic interface | Branded with the business's logo, colors, greeting |
| Closed-source data pooling | Each customer's data is isolated; never pooled or sold |

### 2.3 Channels

A single Dunper agent can speak to customers across:

- **Web chat widget** — embedded on the business's existing website with three lines of code.
- **WhatsApp Business** — via the Meta WhatsApp Cloud API. Customer messages the business's WhatsApp number; Dunper replies inside WhatsApp.
- **Hosted chat page** — for businesses that don't have their own website. Their customers can visit `https://dunper.com/<business-slug>` or a custom subdomain.
- **Phone (planned)** — voice answering via Twilio + speech-to-text, on the post-pilot roadmap.

All channels share one conversation memory per customer, so a person who started a question on WhatsApp can finish booking on the web widget.

---

## 3. How it works

### 3.1 Conversation flow

```
   ┌─────────────────────────────┐
   │    Customer sends message   │
   │   (WhatsApp / web widget)   │
   └──────────────┬──────────────┘
                  │
   ┌──────────────▼──────────────┐
   │   Dunper webhook receives   │
   │     message + history       │
   └──────────────┬──────────────┘
                  │
   ┌──────────────▼──────────────┐
   │  System prompt assembled    │
   │  (business config + hours   │
   │   + services + tone)        │
   └──────────────┬──────────────┘
                  │
   ┌──────────────▼──────────────┐
   │      Claude (Anthropic)     │
   │      reasons & responds     │
   └──────────────┬──────────────┘
                  │
       ┌──────────┴───────────┐
       │                      │
   ┌───▼──────┐         ┌─────▼────────┐
   │ Answer   │         │ Action call  │
   │ inline   │         │ (book, lead, │
   │          │         │  escalate)   │
   └───┬──────┘         └─────┬────────┘
       │                      │
       │                ┌─────▼──────────┐
       │                │ Google         │
       │                │ Calendar /     │
       │                │ DB / SMTP      │
       │                └─────┬──────────┘
       │                      │
   ┌───▼──────────────────────▼─────────┐
   │  Reply sent back via same channel  │
   └────────────────────────────────────┘
```

Every conversation is logged to the business's private SQLite database with full text, timestamps, and any actions taken. The owner sees these in real time in their dashboard.

### 3.2 The business knowledge model

Each Dunper deployment is configured with a structured `business.json` capturing:

- **Identity**: name, type (dental clinic, salon, etc.), location, phone, email.
- **Hours**: structured weekly schedule + per-date overrides for holidays and special closures. Edited via a calendar UI in the business owner's dashboard.
- **Services**: list of services with duration and price.
- **Booking rules**: free-text rules the AI must respect (e.g. "Appointments require at least 24 hours notice").
- **Tone**: free-text description of how the AI should sound ("Warm, professional, reassuring — many patients are nervous about dental visits").
- **Fallback contact**: what to say and who to escalate to when stuck.

This is compiled into a system prompt sent to Claude on every conversation. The business owner can edit any field and the change applies on the next message — no retraining, no redeployment.

### 3.3 Booking

Booking is the single hardest thing for chatbots to get right, because it requires both natural-language understanding and real-world calendar arithmetic. Dunper handles it by:

1. Parsing the customer's intent ("I'd like a teeth cleaning next Tuesday afternoon").
2. Querying the business's Google Calendar for actual availability in that window, filtered against the configured services' duration.
3. Proposing one or two specific times back to the customer.
4. On confirmation, writing the event directly to Google Calendar with the customer's name + phone + service.
5. Sending a confirmation email through the business's configured SMTP, and (optionally) a WhatsApp confirmation.

When the calendar API is unavailable (token expired, etc.), Dunper does not invent times — it tells the customer it can't check right now and offers a callback.

### 3.4 Escalation and honesty

Dunper is built around one strong principle: **when the AI doesn't know, it must say so**, not invent.

Three signals trigger escalation:

- The customer explicitly asks for a human.
- The AI's confidence in its answer is low (detected via a self-check pattern).
- The question requires real-time information the AI doesn't have (e.g. "is Dr. Smith in today?" when no presence integration exists).

On escalation, the AI sends one of the configured fallback messages, the conversation is flagged in the dashboard with a red marker, and (when configured) an email is sent to the business owner with the full conversation context.

---

## 4. Architecture

### 4.1 Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 + Express | Mature, fast iteration, low ops overhead |
| Database | SQLite (single-tenant) → Postgres (multi-tenant) | SQLite is sufficient to ~10 businesses; Postgres becomes necessary past that |
| AI | Anthropic Claude (Opus / Sonnet) | Best-in-class instruction following, multilingual quality, safety reflexes |
| Edge / TLS | Cloudflare (Workers + Tunnels) | Free TLS, global edge, no ports opened on origin |
| Calendar | Google Calendar API | Already where customers' actual schedules live |
| Messaging | Meta WhatsApp Cloud API | Direct channel to Indonesian SMB customers |
| Email | SMTP via Gmail / Resend / Postmark | Pluggable; for 2FA codes, confirmations, escalations |
| Frontend | Vanilla HTML/CSS/JS + small JS in dashboards | Zero build step, fast load, low complexity |
| Auth | bcrypt + email 2FA today → Clerk/WorkOS at scale | Cost-efficient now, planned swap at 20+ customers |

### 4.2 Three surfaces, one origin

Dunper is deliberately served from a single Express process per business deployment. This is unusual — most SaaS products separate marketing site, application, and API. Dunper does not, because cookie-based authentication is dramatically simpler when there is only one origin:

```
                       dunper.com
                            │
            ┌───────────────┼───────────────┐
            │               │               │
   ┌────────▼────┐  ┌───────▼──────┐  ┌────▼────────┐
   │ Marketing   │  │ Business     │  │ Founder     │
   │ /website/*  │  │ dashboard    │  │ dashboard   │
   │             │  │ /admin.html  │  │ /operator   │
   └─────────────┘  └──────────────┘  └─────────────┘
            │               │               │
            └───────────────┼───────────────┘
                            │
                  ┌─────────▼─────────┐
                  │ Customer chat at  │
                  │ /preview-chat     │
                  │ (embed iframe)    │
                  └───────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │   API (/api/*)    │
                  │   Webhooks        │
                  │   Integrations    │
                  └───────────────────┘
```

Each deployment also exposes a `/webhooks/whatsapp` endpoint that the Meta API delivers messages to, and a `/webhooks/google-oauth` endpoint that completes Google Calendar authorization.

### 4.3 Per-deployment isolation

At the current single-tenant stage, each customer business runs as its own Node process with its own SQLite database file, its own `business.json`, and its own credentials for Google and WhatsApp. There is no shared database, no shared application logic, and no path by which one business's data can be read by another. This is the simplest possible privacy posture and is appropriate up to roughly 10–20 customers.

As the customer base grows, Dunper will migrate to a multi-tenant Postgres model with explicit `workspace_id` keys on every row. The roadmap for that migration is documented internally in [docs/scaling-roadmap.md](scaling-roadmap.md).

### 4.4 Reliability and observability

- **Daily automated backups** of each business's database to local disk and (configurable) to Cloudflare R2.
- **Health endpoints** at `/health` for external uptime monitoring (UptimeRobot).
- **Anthropic usage logging** — every AI call is logged with token counts and cost in cents, giving per-customer unit economics.
- **Conversation history** is retained in full per business so the owner can audit any interaction.

---

## 5. Data privacy and security

Dunper's privacy posture follows three rules:

1. **No data pooling.** Each business's customer data lives only inside that business's deployment. No data flows between customers. No data is sold.

2. **Customer data belongs to the business.** Conversation logs, booking records, and customer profiles are owned by the business. Export-on-request and full-deletion-on-request are supported. Indonesia has no comprehensive data protection law yet; Dunper voluntarily applies GDPR-equivalent rules ahead of regulation.

3. **AI providers see only what's needed.** Each Claude API call sends only the conversation history and the business's curated configuration — no customer database rows except the active conversation. Anthropic has a no-training contractual commitment for API calls.

### 5.1 Technical safeguards

- **TLS everywhere** (via Cloudflare).
- **HTTPS-only cookies** with `SameSite=Lax` for session management.
- **CSRF protection** on all state-changing endpoints via `Sec-Fetch-Site` + Origin checks.
- **Rate limiting** on auth endpoints (20 attempts / 15 min / IP), webhook endpoints (200 / min), and the public contact form (5 / 15 min / IP).
- **2FA via email** for all owner accounts.
- **Bcrypt-hashed passwords** with cost factor 10, plus dummy-hash comparison on lookup misses to prevent username-enumeration via timing.
- **HMAC-signed webhooks** verifying that incoming WhatsApp events actually came from Meta.
- **App secrets** stored in `.env` files outside the git tree.

### 5.2 Compliance posture

Dunper does not yet have SOC 2, ISO 27001, or any formal compliance certification. These will be pursued in the order our customers ask for them; the first SOC 2 audit is planned at roughly the 30-customer mark. Until then, the practical security model is "small surface area, well-understood components, modern defaults."

---

## 6. Use cases

Dunper is built specifically for small service businesses with the following common shape:

- 1–20 employees
- Customer interactions involve scheduling, pricing inquiries, and booking
- Multilingual customer base
- The owner answers most messages personally today

The verticals it serves best are:

### 6.1 Dental clinics

Common questions: opening hours, pricing for specific procedures, insurance acceptance, first-visit paperwork. Dunper books cleanings and consultations directly into Google Calendar. Patients appreciate getting an immediate response at 11pm Saturday when their tooth starts hurting.

### 6.2 Salons and spas

Common questions: available stylists, pricing for services, walk-in availability. Dunper handles language switching (a single salon in Jakarta serves expats, locals, and Mandarin-speaking visitors). Heavy DM volume on Instagram is the typical pain point — Dunper plugs into WhatsApp Business which most salons already use.

### 6.3 Independent dentists, therapists, tutors, consultants

Single-practitioner businesses where the owner cannot answer the phone while working with a client. Dunper qualifies leads ("are you a new patient?", "is this a routine cleaning or something more urgent?") and books accordingly.

### 6.4 Restaurants

Common questions: hours, takeout availability, reservations, allergens. Dunper handles reservations into Google Calendar (or, planned, into restaurant-specific systems like SevenRooms / OpenTable).

### 6.5 Where Dunper is NOT a fit (yet)

- Enterprises with custom CRM integration requirements (planned: public API).
- Industries with strict regulatory chatbot rules (e.g., direct medical advice). Dunper actively refuses to give medical, legal, or financial advice and routes to a human.
- High-volume e-commerce with order tracking needs (different product class).

---

## 7. Pricing

Four tiers are offered today on https://dunper.com/dunper_join.html:

| Plan | Price | Conversations / month | Languages |
|---|---|---|---|
| Starter | Free | 100 | 1 |
| Pro | $20 / month | 500 | 5 |
| Max | $50 / month | 2,000 | 40+ |
| Custom | Talk to sales | Any | Any |

All plans include unlimited data, custom agent configuration, and the full chatbot feature set. The free Starter tier is intended for businesses to validate fit before committing — not as a long-term plan.

Annual billing offers a 20% discount (toggle on the join page).

A "conversation" is a unique customer thread within a calendar month. A returning customer chatting again in the same month does not consume an additional conversation slot.

---

## 8. Roadmap

The plan, in honest order:

| Horizon | Goal | Key shipping work |
|---|---|---|
| Next 30 days | Make it un-embarrassing | Move off the laptop to a $5 VPS; swap Gmail SMTP for Resend; first production WhatsApp number with a real business name; structured schedule JSON (not just plaintext hours) |
| Next 90 days | First 5 paying customers | `onboard-client.sh` script; Stripe Checkout end-to-end; per-customer Anthropic-cost reporting; R2 backups; UptimeRobot monitoring |
| 10–25 customers | Multi-tenant migration | `workspace_id` on every table; SQLite → Postgres; auth swap to Clerk/WorkOS; tenant-resolution middleware |
| Year 1+ | Vertical packaging | Industry-specific landing pages and configurations; public REST API; phone-call answering via Twilio; multi-region deployment when EU/AU latency complaints arrive |

The single hardest engineering decision on the horizon is the single-tenant → multi-tenant migration, which will happen between customers 15 and 25. The decision is "when," not "whether."

---

## 9. About Dunper

Dunper AI was started in 2026 in Jakarta by five co-founders — two front-end engineers, two back-end engineers, and one running marketing and customer development. The team came together over a year of watching family, friends, and businesses around them juggle the same problem: too many channels, not enough hands, and a customer base that expects an answer in minutes.

The product began as an internal experiment called FrontDesk — a question-answering bot for a friend's dental clinic. When that experiment quietly held up under real customer load for three months, the team decided to turn it into a product, rebranded as Dunper, and launched the marketing site at dunper.com in May 2026.

We are building for Indonesian small businesses first, with the rest of Southeast Asia as the natural next wave. Multilingual support is not a localization checkbox — it is a core requirement of the market we are starting in.

### 9.1 Team

| Name | Role |
|---|---|
| Aurel Gregoria | Front-end |
| Marc Tjhin | Front-end |
| Owen Tjandra | Back-end |
| Christopher Lo | Back-end |
| Cathleen Wang | Marketing & customer development |

Reach the team at **dunperai@gmail.com** or **@dunper.ai** on Instagram.

---

## 10. Conclusion

The thesis of Dunper AI is narrow on purpose: **small service businesses lose customers because they cannot answer fast enough, and an AI receptionist that actually integrates with their calendar, speaks their customers' languages, and knows when to escalate is the practical fix.**

We are not building artificial general intelligence. We are not chasing the largest enterprises. We are not trying to be a horizontal chatbot platform. We are building one thing — a receptionist that shows up — for a clearly defined customer.

If you run a small service business in Jakarta, Bandung, Surabaya, Singapore, Kuala Lumpur, or anywhere in this region, and the problem above sounds like yours, we would love to hear from you. The fastest path to a working pilot is roughly a one-week setup, and the first month is free.

**Get in touch:**

- Web: https://dunper.com
- Email: dunperai@gmail.com
- Instagram: @dunper.ai
- Live chat: https://dunper.com/dunper_chat.html

---

*Dunper AI Pte. Ltd. · Jakarta, Indonesia · May 2026 · Whitepaper v1.0*

*This document describes the product and architecture as of May 2026. Features marked "planned" are on the public roadmap but not yet shipped. For the most current information, please reach out directly.*
