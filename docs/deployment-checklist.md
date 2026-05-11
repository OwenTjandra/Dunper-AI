# Deployment checklist — dunper.com

Run order roughly top-to-bottom. Everything below "Day-of cutover" assumes
the items above it are done.

## What's already ready

- One Express process serves both the marketing site (`website/`) and the
  app (`public/` + `src/server.js` routes). Same origin → the login
  cookie set on `dunper_signin.html` is the same cookie the app reads
  on `/admin.html` / `/operator.html`.
- Marketing sign-in form (`website/dunper_signin.html`) posts to
  `/api/auth/login` and redirects to the right dashboard based on role.
- `/admin.html` gated by `requireBusinessOwner`, `/operator.html` gated by
  `requireFounder` (in `src/server.js`).
- `.gitignore` already excludes `.env`, `data.db*`, `uploads/`, `backups/`,
  and the Google service-account JSON.

## Before going public

### 1. Rotate secrets

- [ ] Generate a real `ADMIN_PASSWORD` (not `change-me-now`) and 5
      strong `FOUNDERS` passwords. Update them via the DB, not by
      changing `.env` — the seeder is idempotent and never overwrites
      existing rows. Easiest path:
      ```bash
      sqlite3 data.db "DELETE FROM users;"  # nukes ALL logins; back up first
      ```
      then restart the server with new `.env` values.
- [ ] Rotate `ANTHROPIC_API_KEY` if the current one was ever shared.
- [ ] Confirm `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN` and
      `WHATSAPP_APP_SECRET` are production values, not the test app.
- [ ] Decide what to do with the Google OAuth client — staying on the
      same client for prod is fine, but the redirect URI in
      `console.cloud.google.com` must include `https://dunper.com/api/integrations/google/callback`.

### 2. Public hostname + TLS

- [ ] Decide hosting: laptop (current) → Mac mini (planned) → eventually
      a real VPS. Until the Mac mini is up, a Cloudflare named tunnel
      pointed at the laptop is the path to public access — but rotate
      the temp `trycloudflare.com` URL for a **named** tunnel pinned to
      `dunper.com` (the current quick-tunnel URL rotates every restart).
- [ ] DNS: `A` or `CNAME` for `dunper.com` (and `www.dunper.com`) at the
      tunnel/host. Optional: `app.dunper.com` if you want to split
      marketing from the app on different subdomains.
- [ ] HTTPS: handled by Cloudflare for the named tunnel; for a real VPS,
      Caddy or nginx + Let's Encrypt. Express itself should not terminate
      TLS — keep it as plain HTTP behind the proxy.

### 3. Server hardening

- [ ] Set `NODE_ENV=production` so the cookie `secure: true` and
      `sameSite: 'strict'` can be tightened (currently `sameSite: 'lax'`
      in `src/auth.js` — fine for now).
- [ ] Set explicit `PORT` (default 3000 is fine if behind the tunnel).
- [ ] Confirm `app.set('trust proxy', 'loopback')` is correct for the
      proxy you end up with. If Cloudflare → set `trust proxy` to
      `'1'` or the specific Cloudflare IP range.
- [ ] Tighten `express-rate-limit` thresholds for `/api/auth/login`
      (currently relaxed in dev).

### 4. Customer-facing chat URL

The customer chat lives at `/` (served by `public/index.html`). The
widget script (`website/js/dunper-widget.js` and
`website/js/dunper-client-widget.js`) takes a `DUNPER_CHAT_URL` config
that should point at this.

- [ ] When deployed, update the **default** `DUNPER_CHAT_URL` in
      `dunper-widget.js` from `'dunper_chat.html'` to
      `'https://dunper.com/'` — so clients who copy the embed snippet
      without setting the global still get the live chat.
- [ ] Decide: keep `/` as the customer chat (current state — referenced
      by WhatsApp webhook, dashboard preview, widget embed), and ship
      the marketing landing at `/dunper_home.html`. **Or** add a UA /
      query-param check at `/` that serves marketing to humans and the
      chat to widget iframes — see "Open questions" below.

### 5. Decide what to gate

| Path | Public? | Why |
|---|---|---|
| `/dunper_home.html`, `/dunper_about.html`, `/dunper_services.html`, `/dunper_contact.html`, `/dunper_join.html` | yes | Marketing |
| `/dunper_chat.html` | yes | Public demo |
| `/dunper_widget.html` | yes | Embed instructions, industry-standard |
| `/dunper_client_widget.html` | **gate it** | "Rough draft" tag + full API surface — show to logged-in business owners only. Move it from `website/` into `public/` and add `requireBusinessOwner` to the static-gate block in `src/server.js`. |
| `/dunper_signin.html` | yes | Login form |
| `/admin.html` | gated (business_owner) | Tenant dashboard |
| `/operator.html` | gated (founder) | Founder god-view |
| `/login.html` | yes | App login (in addition to marketing sign-in) |

### 6. Smoke test before flipping DNS

- [ ] `curl https://dunper.com/dunper_home.html` returns the marketing page.
- [ ] `curl https://dunper.com/admin.html` returns a 302 redirect to `/login.html`.
- [ ] Login form on `/dunper_signin.html` actually signs you in (cookie
      set, redirect to `/admin.html` or `/operator.html`).
- [ ] `/api/auth/me` returns the right role after login.
- [ ] The widget embed snippet (from `/dunper_widget.html`) iframes
      `https://dunper.com/` and renders the customer chat.
- [ ] WhatsApp webhook at `https://dunper.com/webhooks/whatsapp` still
      gets through (Meta requires public HTTPS + the verify token).

## Day-of cutover

1. Push the latest commit on `main` to the laptop / Mac mini.
2. `npm install && node src/server.js` (or whatever process manager you
   use — `pm2`, `systemd`, etc.).
3. Bring up the Cloudflare named tunnel.
4. Flip DNS for `dunper.com` to the tunnel.
5. Run the smoke test above.
6. Update `DUNPER_CHAT_URL` default in `dunper-widget.js` (post-deploy
   commit).

## Open questions to decide before launch

- **`/` ambiguity** — keep customer chat there, or redirect to marketing
  by default and serve chat only at `/chat` or `/embed/{tenantId}`? The
  cleaner answer is the second one, but it's a structural change.
- **Per-tenant routing** — currently single-tenant. Before customer #2
  signs up, the chat URL has to carry the tenant identity. Cleanest
  shape: `/embed/{tenantId}` for the chat, `/admin/{tenantId}` for the
  dashboard. Out of scope for the initial launch.
- **Founder password reset flow** — there isn't one yet. If any
  founder forgets their password, only path is SQL into `data.db`. Build
  this before founders #2-#5 actually start using the dashboard.
