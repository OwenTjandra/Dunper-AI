# Changelog

All notable changes to this project. Entries are in reverse chronological order (newest first). Each entry lists what changed and which files to look at if a regression appears.

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
