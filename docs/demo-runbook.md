# May 12 Demo Runbook — exact clicks + exact words

5 minutes total. Practiced version. The script tells you what to **click** and what to **say**. Anything in *italics* is optional / cut if running long.

---

## 60 minutes before the demo — setup

Open 4 terminal tabs + 4 browser windows.

### Terminal 1 — clean DB and seed demo data

```bash
cd ~/Documents/Claude\ Projects/FrontDesk/frontdesk-ai
git pull origin main
node scripts/seed-demo-data.js --reset
```

You should see:
```
🌱 Seeding demo data...
   ✓ 8 customer profiles + conversations + summaries
   ✓ 4 bookings (mix of tomorrow + day after)
   ✓ 2 escalations (Pak Joko · laser, Maya · cancellation policy)
   ✓ 2 unanswered questions
   ✓ 5 sales prospects (lead → active spread)
   ✓ 30 days of Anthropic usage history (~$X total)
🎉 Demo seed complete.
```

### Terminal 2 — start the server

```bash
node src/server.js
```

Keep this terminal visible during the demo — if anything goes wrong, you'll see the error here.

### Terminal 3 — start the chatbot tunnel (cloudflared)

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the public URL it prints (e.g. `https://random-words-here.trycloudflare.com`). You'll need it in 2 minutes.

### Terminal 4 — keep blank for emergencies

### Browser windows

| Window | URL | Login? | What it shows |
|---|---|---|---|
| **A** | https://dunper.com (or `dunper-ai.dunperai.workers.dev`) | No | Marketing site |
| **B** | `http://localhost:3000/dunper_signin.html` | Yes (do this in advance) | Sign-in page — log in as your business_owner account |
| **C** | `http://localhost:3000/admin.html` | Already logged in via B | Business dashboard |
| **D** | `http://localhost:3000/operator.html` | Same session works | Founder dashboard |

**Do NOT log out between sections.** Demo while logged in.

### Final checks (5 min before)

- [ ] Window A loads with "Make It Simple." headline
- [ ] Window C shows 8 customers + 4 bookings + 2 unanswered questions
- [ ] Window D shows "This week" tile + 5 prospects + the active customer is "DEMO · Salon Citra"
- [ ] Cloudflared tunnel URL works (open it on your phone)
- [ ] Phone fully charged + on cellular as wifi backup
- [ ] **Backup video** open in finder, ready to play if everything dies
- [ ] Pitch deck open in PowerPoint full-screen

---

## The 5-minute demo flow

### Opening — 30 sec  (Window A — marketing site)

**Say (verbatim, memorize this):**

> "Small businesses in Indonesia answer the same questions all day, on WhatsApp and in person, in three different languages. They miss after-hours leads. They double-book. They lose customers to whoever responds first. Dunper is the AI receptionist that fixes that — for less than the price of a phone bill."

**Do:** Have Window A open. Don't click anything yet — the marketing site is the visual backdrop while you say the opener.

---

### Act 1 — The marketing site  — 30 sec  (Window A)

**Click:**
1. Scroll down once on the home page. Show the "Make It Simple." headline + the 3 facts strip (10K+ / 98% / 40+).
2. Scroll down once more. Show "Three steps to smarter customer service" — Connect / Configure / Grow.
3. Scroll back up. Click the **"Try Dunper AI →"** button in the hero (the navy pill button).

**Say:**

> "This is what a prospect sees. Static. Fast. Multilingual. Bahasa-first. And the floating chat in the bottom corner — that's the actual product they can try. Let's open it."

*(If "Try Dunper AI" button doesn't open the chat: switch to Window B and walk through anyway. Don't make a face. Move on.)*

---

### Act 2 — The customer chatbot — 90 sec  (Window B → live chat)

You're now in the customer-facing chatbot. Use the **Cloudflared tunnel URL** (Terminal 3) so it looks production-ready, not localhost.

**Type these messages, one at a time:**

1. **"Hi, do you have any availability tomorrow afternoon for a haircut?"**
2. Wait for the bot's response. It should pull real availability from `business.json`.
3. **Pick whatever slot it offers**, e.g.: *"2pm works"*
4. Wait — bot will ask for name + phone. Type: **"Sari, +62 812-3456"**
5. Bot confirms the booking.

**Say while the bot is typing each response:**

> "Notice it's pulling real availability — not a generic answer. It knows our hours, our service durations, our calendar holidays. And — *(pause until response arrives)* — it just put that on the Google Calendar."

6. **Type:** **"bisa ulangi waktu booking-nya?"** (Indonesian for "can you repeat the booking time?")
7. Bot replies in Indonesian. Confirms.

**Say:**

> "60+ languages, code-switching mid-conversation. This is a real demo — try it after."

8. **Type:** **"do you do laser hair removal?"**
9. Bot honestly says it doesn't have that info and offers to escalate.

**Say:**

> "And it doesn't hallucinate. When it doesn't know, it says so — and it flags this for the owner to review. That escalation just went into the admin dashboard. Let me show you."

---

### Act 3 — Business owner dashboard — 90 sec  (Window C — admin.html)

Switch to the admin window. You should already be logged in.

**Click sequence:**

1. **Customers** card → scroll the list — show that 8 customers are there with name + phone + last seen.
2. Click into **"Sari Wijaya"** → show:
   - The full conversation transcript (the one you just had + her earlier conversation about loyalty)
   - **AI-generated summary** with intent ("booking") and sentiment ("positive")

**Say:**

> "Every conversation gets summarized automatically. The owner sees what the customer wanted and how they felt — without reading a single message. Saves an hour a day."

3. Close customer modal. Click **Customers waiting for an agent** card.
4. Show the escalations — "Pak Joko · laser hair removal" and "Maya · cancellation policy."

**Say:**

> "These are the customers who need a human. The owner sees them prioritized, with context."

5. Click **Anthropic API usage** card. Show the cost graph (30 days of synthetic data).

**Say:**

> "Full cost transparency. Every conversation costs about 1 cent. We charge $20-50/month, so even at 100 conversations a day the unit economics work — 85% gross margin."

6. *(Optional)* Click **Edit with AI** card → type:
   - **"Add a 15% loyalty discount for customers who have booked 3+ times this year"**
   - Wait for the AI to update the business config.

**Say (if you did step 6):**

> "The owner edits the bot's brain in plain English. No JSON, no prompts, no engineering. They describe their business and it adapts immediately."

---

### Act 4 — Founder dashboard — 45 sec  (Window D — operator.html)

Switch to the founder window.

**Click sequence:**

1. Top of the page → **"This week at a glance"** card. Show 4 tiles:
   - Active MRR: **$20**
   - Demos this week: **1** (Bakso Pak Joko)
   - Open pipeline: **3**
   - Actions due: **3**

**Say:**

> "This is what *we* see. The active MRR is $20 — one paying customer, Salon Citra. We have one demo this week with Bakso Pak Joko. And three actions due in the next 7 days. The dashboard answers 'what do I need to do this week' the moment I open it."

2. Scroll down → **Sales pipeline** section. Show the 5 prospects color-coded by status.
3. Click into **"DEMO · Klinik Gigi Sehat"** (demo_done status) — show the prospect modal with contact, vertical, next step.

**Say:**

> "Built for us so we can scale without losing track. As we grow from one customer to 50, this stays the same screen — just more rows."

---

### Closing — 30 sec

Switch back to Window A (the marketing site).

**Say (memorize this):**

> "The chatbot you just used — that's running on a laptop in my apartment, behind a Cloudflare tunnel. We can deploy a new tenant in 10 minutes. We're targeting 5 paying customers by July, 50 by December — that's $25K ARR. We're raising $150K pre-seed to get there. We'd love to have you on the cap table."

Pause. Smile. Don't over-explain. Wait for them to ask the first question.

---

## The 3 questions you'll probably get + the answers

**Q: What if the AI gets something wrong?**

> "Three layers. One: it falls back to 'I don't know' rather than hallucinate — you saw that with the laser hair question. Two: every conversation is reviewed by the owner the next morning. Three: the owner can correct the bot's brain in plain English, takes effect immediately. We don't try to be perfect — we try to be honest about what we don't know."

**Q: How are you different from Intercom / Drift / ChatGPT?**

> "Those are built for SaaS companies with English-speaking customers and developer ops teams. We're built for a 10-person warung in Surabaya whose owner has never heard the word 'API.' Same underlying tech, completely different product surface. Bahasa, QRIS payments, Indonesian business hours, WhatsApp-first. Western tools won't bother with a $20-a-month customer."

**Q: What's the moat? Anyone can wrap Claude.**

> "Three things. First, the per-business knowledge tuning loop — the bot gets better the more the owner uses it, which is compounding data we own. Second, the WhatsApp Business integration which is annoying to build right and we already did. Third, Indonesian-language onboarding and pricing — competitors literally won't bother with the Indonesian market for years. By the time they do, we'll have the relationships."

---

## What to do if something breaks live

| Symptom | What to do |
|---|---|
| Bot responds slowly (>5 sec) | "It's calling Claude — takes a few seconds. Imagine a thoughtful answer in 3 seconds vs. a script in 0.5 seconds." Keep talking. |
| Bot doesn't respond at all | Switch to Terminal 2, see the error. If it's an Anthropic issue, switch to backup video. |
| WiFi dies | Move to phone hotspot. Demo continues. If hotspot also dies → backup video. |
| Audience asks about a feature you haven't built | "Great question — that's on the roadmap for Q3. The chatbot today nails the 80% of cases where you'd otherwise lose the customer." Never apologize for missing features. |
| Tunnel rotates mid-demo (URL stops working) | Switch to localhost:3000 in front of them. Joke: "And that's why we're raising for production infrastructure." Move on. |

**Never say "oh that's a bug." Say "let me move past that — the next slide is more interesting."**

---

## After the demo

- Send a follow-up email within 2 hours:
  - Link to the marketing site
  - Link to the pitch deck (PDF export)
  - Calendar link for a follow-up call
- Add the investor to operator dashboard as a lead with `next_step_at` set to 3 days out

---

## Practice plan

- **May 11 (today, evening):** Run through end-to-end 3 times. Time yourself. Goal: 5 minutes flat. Record the 3rd one as backup video.
- **May 12 morning:** One full dry run with seed-data --reset. Then stop. Eat well. Drink water. Don't tinker.
- **May 12 afternoon:** Demo.

You've built the product. Trust it. The demo is just showing what's already true.
