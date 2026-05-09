# Dunper AI — Demo Script (May 12, 2026)

A 5-minute live walkthrough. Practiced version. The script below is what to **do** + what to **say** at each step. Skip anything in *italics* if running over time.

---

## Pre-demo checklist (run 30 min before)

- [ ] `cd frontdesk-ai && git pull && npm start` — server up
- [ ] Run `cloudflared tunnel run <named-tunnel>` (or quick tunnel) — get a public URL
- [ ] Open the public URL in a fresh incognito window — confirm chat loads
- [ ] Open `localhost:3000/admin.html` in another window — login as admin
- [ ] Open `localhost:3000/operator.html` in a third window — login as operator
- [ ] Open `https://dunper.com/` in a fourth window — confirm marketing site is up
- [ ] Phone fully charged, on the same network OR cellular as backup
- [ ] **Backup video** ready: 60-second screen recording of the same flow saved to desktop, in case wifi dies

If any of the above fails, switch to the backup video and explain "live demo had a network issue, here's the recorded flow."

---

## The story (what you're selling)

> "Small businesses in Indonesia answer the same questions all day, every day, in three languages, on WhatsApp and in-store. They miss after-hours leads. They double-book. They lose customers to whoever responds first. Dunper is the AI receptionist that fixes all of that — for the price of a phone bill."

That's the elevator pitch. Memorize it. Open the demo with it.

---

## The flow (5 minutes)

### Act 1 — The marketing site (45 sec)

1. Open `https://dunper.com/`
2. Scroll once. Say:
   > "This is what a prospect sees. Clean. Fast. Multilingual. The whole site loads in under a second because it's static — that's intentional, our customers are SMEs and many will visit on slow 3G."
3. Click **Try the demo** in the nav chatbar (or click the "Open chatbot" button on the page).

### Act 2 — Customer chat (90 sec)

You're now in the customer-facing chatbot.

1. **Say** in chat: "Hi, do you have any availability tomorrow afternoon for a haircut?"
2. Wait for the bot to respond with available slots.
   - *(Talking points while the bot types):* "Notice it's pulling real availability from the booking calendar — not a generic answer. It knows our hours, our service durations, our blackouts."
3. Pick a slot (e.g. "2pm works").
4. Bot asks for name + phone. Type both.
5. Bot confirms the booking.
6. **Switch language mid-conversation:** type "thanks, bisa ulangi waktu booking-nya?" (Indonesian).
7. Bot replies in Indonesian, repeats the booking time.
   - **Say:** "60+ languages, code-switching mid-conversation. This is a real demo, no scripted answers — try it after."
8. Type something it shouldn't know: "Do you do laser hair removal?"
9. Bot honestly says it doesn't have that info and offers to connect a human.
   - **Say:** "And it doesn't make stuff up. It hands off to a human when it doesn't know — that's the trust foundation."

### Act 3 — Business owner dashboard (90 sec)

Switch to the admin window (`localhost:3000/admin.html` — pre-logged-in).

1. Click **Customers** card → show the customer you just created with the booking.
2. Click into the customer → show the conversation transcript + AI-generated summary (intent, sentiment).
   - **Say:** "Every conversation is summarized automatically. Owner sees what the customer wanted, how they felt, before reading a single message."
3. Click **Bookings** card → show the booking just created. *Click into it to show the Google Calendar link if Google is connected.*
4. Click **Edit with AI** card → demonstrate one prompt:
   - Type: "Add a 15% loyalty discount for any customer who has booked 3+ times this year"
   - **Say:** "The owner edits the bot's brain in plain English. No prompt engineering, no JSON config. They describe their business and it adapts."
5. *Click **Anthropic API usage** card → show the cost graph.*
   - *Say: "Full cost transparency. Every conversation costs about 1 cent. We charge $29-79/mo, so even at 100 conversations a day the unit economics work."*

### Act 4 — Founder dashboard (45 sec)

Switch to the operator window (`localhost:3000/operator.html`).

1. Show the businesses list.
2. Show the sales pipeline:
   - **Say:** "This is what we see. All our customers, all our prospects, where each is in the pipeline. Built for us so we can scale without losing track of who's where."
3. Click on a prospect → show the modal with company details, status, notes.
4. *Drag-and-drop a status change (lead → demo_scheduled).*

### Act 5 — Close (30 sec)

> "The chatbot you just used — that's running on a laptop in my apartment, behind a Cloudflare tunnel. We can deploy a tenant in 10 minutes. We're targeting 5 paying customers by July, 50 by year-end. We're raising a small pre-seed to get there, and we'd love to have you on the cap table."

Pause. Smile. Don't over-explain. Let them ask the next question.

---

## The 3 questions you'll get + the answers

**Q: What if the AI gets something wrong?**
> Three layers: (1) it falls back to "I don't know" rather than hallucinate, (2) every conversation is reviewed by the owner the next morning, (3) the owner can correct the bot's brain in plain English and the fix takes effect immediately.

**Q: How do you compare to Intercom / Drift / [Western chatbot]?**
> They're built for SaaS companies with English-speaking customers and developer ops teams. We're built for a 10-person warung in Surabaya whose owner has never heard the word "API." Same underlying tech, completely different product surface.

**Q: What's the moat? Anyone can wrap GPT.**
> Three things: (1) the per-business knowledge tuning loop — the bot gets better the more the owner uses it, that's compounding data, (2) the WhatsApp integration which is annoying to build right and we already did, (3) Indonesian-language onboarding and pricing — Western tools won't bother for a $29 customer.

---

## If something breaks live

- **Bot responds slowly** → "It's calling Claude, takes about 3 seconds. Imagine getting a thoughtful answer in 3 seconds versus a script in 0.5 seconds."
- **Bot doesn't respond** → Check tunnel. If still broken, switch to backup video.
- **WiFi dies** → Move to phone hotspot. If that also dies, backup video.
- **Audience asks for something we haven't built** → "Great question — that's on the roadmap for [reasonable timeline]. The chatbot today nails the 80% of cases where you'd otherwise lose the customer."

Never apologize for missing features. Frame them as "next."

---

## Practice plan

- **May 10:** Run through end-to-end 3 times. Time yourself. Goal: 5 minutes flat.
- **May 11:** Run through 2 more times. Record one of them as the backup video.
- **May 12 morning:** One full dry run, then stop. Don't tinker. Eat well, hydrate.

You've built the product. Trust it. The demo is just showing what's already true.
