# Deploying Dunper to dunper.com — step by step

This is the operator's runbook for taking the laptop instance public on
`dunper.com`. The recommended path is **Cloudflare named tunnel** — no
VPS, no opened ports, free TLS, and the URL doesn't rotate on restart.

> **I can't deploy this for you from inside the assistant.** Domains and
> hosting accounts need *your* credentials and 2FA codes; only you can
> log into Cloudflare/GoDaddy/Google and create those resources. What
> I've done is prepare the codebase + this runbook so each step below
> is copy-paste; if any step fails, look at the "If something goes
> wrong" sections.

---

## 0. Pre-flight (5 minutes)

On the machine you're going to run from (your laptop right now, the
Mac mini next month):

```bash
node --version          # need >= 22
git --version
git pull origin main    # pull the latest from GitHub
npm install             # if you haven't recently
```

Make sure `.env` exists and has these set:

```
ANTHROPIC_API_KEY=...
ADMIN_USERNAME=...
ADMIN_PASSWORD=<STRONG-PASSWORD-NOT-change-me-now>
ADMIN_EMAIL=<the gmail you want 2FA codes sent to>
FOUNDERS=founder1:<pw>:<f1@gmail.com>,founder2:<pw>:<f2@gmail.com>,...
PENDING_LOGIN_SECRET=<random 32+ chars — e.g. node -e "console.log(require('crypto').randomBytes(24).toString('hex'))">
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<the gmail you'll send from>
SMTP_PASS=<gmail App Password — see "Gmail App Password" section below>
SMTP_FROM=Dunper AI <the gmail you'll send from>
```

If the database already exists from earlier dev, the new accounts won't
re-seed — the seeder is intentionally idempotent. Either:
- Set the emails on existing users via SQL (instructions in
  `docs/2fa-rollout.md` below), or
- Move `data.db` aside and let it re-seed on next start.

---

## 1. Get a Gmail App Password (for SMTP)

You only need this once.

1. Sign in to the Gmail account that will be the "from" address.
2. Turn on 2-Step Verification (https://myaccount.google.com/security).
3. Visit https://myaccount.google.com/apppasswords.
4. Pick **App: Mail**, **Device: Other → "Dunper SMTP"**.
5. Copy the 16-character password.
6. Paste it into `.env` as `SMTP_PASS` (no spaces).

> **Note**: this password gives full Gmail send access — keep `.env`
> out of git (it already is via `.gitignore`).

---

## 2. Install cloudflared

**Windows (your current setup):**

```powershell
winget install --id Cloudflare.cloudflared
# OR download the .msi from
# https://github.com/cloudflare/cloudflared/releases/latest
cloudflared --version
```

**Mac (when you move to the Mac mini):**

```bash
brew install cloudflared
cloudflared --version
```

---

## 3. Authenticate cloudflared to your Cloudflare account

```bash
cloudflared tunnel login
```

This opens a browser. Pick your Cloudflare account, then pick the
`dunper.com` zone. The token is saved to
`~/.cloudflared/cert.pem` (or `%USERPROFILE%\.cloudflared\cert.pem`
on Windows).

> If you don't have a Cloudflare account yet:
> 1. Sign up at https://dash.cloudflare.com/sign-up (free plan is fine).
> 2. Add `dunper.com` as a site.
> 3. Cloudflare will give you 2 nameservers. Update them at your
>    registrar (the place you bought `dunper.com`). DNS propagation
>    takes 5min–24h.

---

## 4. Create the named tunnel

```bash
cloudflared tunnel create dunper
```

Cloudflare prints a **tunnel ID** (UUID-shaped) and saves credentials
to `~/.cloudflared/<UUID>.json`. Copy the UUID — you'll need it.

---

## 5. Write the tunnel config

Create `~/.cloudflared/config.yml` (Windows: `%USERPROFILE%\.cloudflared\config.yml`):

```yaml
tunnel: <UUID-from-step-4>
credentials-file: <full-path-to-that-UUID.json>

ingress:
  - hostname: dunper.com
    service: http://localhost:3000
  - hostname: www.dunper.com
    service: http://localhost:3000
  - service: http_status:404
```

> The order matters — first match wins. The trailing `http_status:404`
> is required by cloudflared as the catch-all.

---

## 6. Point `dunper.com` at the tunnel

```bash
cloudflared tunnel route dns dunper dunper.com
cloudflared tunnel route dns dunper www.dunper.com
```

This adds two **proxied** CNAME records on the Cloudflare side. Verify
in the Cloudflare dashboard → `dunper.com` → DNS — you should see two
records pointing at `<UUID>.cfargotunnel.com` with the orange cloud on.

---

## 7. Start everything

In one terminal — the app:

```bash
# Windows
cd c:\Users\ThomasPK\Downloads\FrontDesk-main\FrontDesk-main
node src/server.js
```

In another terminal — the tunnel:

```bash
cloudflared tunnel run dunper
```

Hit https://dunper.com from your phone (NOT on the same wifi, to
prove it's actually public). You should see the marketing home page.

---

## 8. Smoke test before pitching anyone

Run these from your phone or any external device:

| URL | Expected |
| --- | --- |
| `https://dunper.com/` | Customer chat (the live AI). |
| `https://dunper.com/dunper_home.html` | Marketing home page. |
| `https://dunper.com/dunper_about.html` | Marketing About. |
| `https://dunper.com/admin.html` (signed out) | Redirects to `/login.html`. |
| `https://dunper.com/login.html` | Two-step sign-in form. |
| Sign in with `ADMIN_USERNAME` | Get an email with a 6-digit code → enter it → land on `/admin.html`. |
| `https://dunper.com/operator.html` (signed out) | Redirects to `/login.html`. |
| Sign in as a founder | Land on `/operator.html`, NOT `/admin.html`. |
| `https://dunper.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<your token>&hub.challenge=42` | Returns `42`. |

If everything passes, update Meta's WhatsApp webhook URL from the
old Cloudflare quick-tunnel URL to `https://dunper.com/webhooks/whatsapp`.

---

## 9. Make it survive reboots

**Windows** — use Task Scheduler:

1. Open Task Scheduler → Create Basic Task.
2. Trigger: When the computer starts.
3. Action: Start a program → `cloudflared.exe` with args
   `tunnel run dunper`.
4. Same for the Node server (`node src\server.js`, working dir
   the project folder).

A cleaner option once you're on the Mac mini: run both as `launchd`
or `systemd` services. The `cloudflared` install on Mac includes
`cloudflared service install` which sets it up for you.

---

## If something goes wrong

### `cloudflared tunnel login` won't open a browser

You're probably SSH'd in to a headless machine. Run it on a desktop
session first to generate `cert.pem`, then copy that file to the
headless machine.

### Tunnel runs but `https://dunper.com` shows Cloudflare 1033 (no tunnel)

The DNS record didn't get created. Re-run
`cloudflared tunnel route dns dunper dunper.com`. Check the dashboard
that the CNAME has the orange "proxied" cloud on — grey cloud means
direct DNS resolution which won't work.

### Tunnel routes but the page says "Error 1016"

The service inside `config.yml` isn't reachable. Confirm
`curl http://localhost:3000/health` returns 200 *on the same machine
the tunnel is running on*. If you see "ECONNREFUSED" the Node server
isn't actually running.

### Sign-in works but no 2FA email arrives

- Check the server console — if it shows
  `[mailer] SMTP not configured` the env vars didn't load. Restart
  the server.
- If it says "sendMail failed: Invalid login", the App Password is
  wrong. Re-generate at https://myaccount.google.com/apppasswords.
- Either way, the code also prints to the server console while the
  mail fails, so you can still sign in to fix it.

### 2FA code keeps coming back invalid

Codes expire after 10 minutes and each new login invalidates the
previous code. Type the most recent one.

### Forgot the admin password / locked out

```bash
# stop the server first
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('NEW-PASSWORD', 10));"
# copy the hash, then:
sqlite3 data.db "UPDATE users SET password_hash='<paste-hash>' WHERE username='admin';"
```

### Cloudflare account is on a free plan — is that OK?

Yes. Named tunnels are free, unlimited bandwidth, free TLS. The
limits you'll hit before the free plan does are your laptop's bandwidth.

---

## What I prepared on the codebase side

- One Express process now serves both the marketing site and the
  dashboards from the same origin. The login cookie set on
  `dunper_signin.html` is the same cookie the dashboards read — no
  CORS, no cross-domain shenanigans.
- The marketing sign-in form (and `/login.html`) both go through the
  new two-step flow: creds → email code → session.
- `requireBusinessOwner` and `requireFounder` middleware are wired in
  `src/server.js` so each dashboard is gated to its role.
- `data.db`, `.env`, `uploads/`, `backups/`, the service-account JSON,
  and the website draft backups are all in `.gitignore` — nothing
  sensitive can accidentally land on GitHub.

---

## Open question to settle before launch

**`/` is currently the customer chat, not the marketing page.** That's
deliberate because the WhatsApp webhook, the in-dashboard preview, and
the widget iframe all expect the chatbot at the root. So:

- `dunper.com/` → customer chat (per-tenant once multi-tenancy lands).
- `dunper.com/dunper_home.html` → marketing.

If you want `dunper.com/` to be marketing instead, the cleanest fix is
to move the customer chat to `/embed/<tenantId>` and update the
widget/webhook to point there. That's a separate PR — flagged in
`docs/deployment-checklist.md` under "Open questions".
