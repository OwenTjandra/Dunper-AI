# Changelog

All notable changes to this project. Entries are in reverse chronological order (newest first). Each entry lists what changed and which files to look at if a regression appears.

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
