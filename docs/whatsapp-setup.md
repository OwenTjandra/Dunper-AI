# WhatsApp setup walkthrough

End goal: a customer messages your WhatsApp Business number, the AI replies, and the conversation appears in your dashboard. ~30 minutes if you follow this top to bottom.

There are two halves: **(A) get a public HTTPS URL pointing at your laptop** so Meta can deliver messages to you, and **(B) configure a WhatsApp Business Account in Meta** so it sends you messages and accepts replies.

You'll do them in this order: A first (so you have a URL), then B (which needs that URL).

---

## A — Cloudflare Tunnel (public HTTPS URL → your laptop)

### A1. Install cloudflared

You may already have it from earlier setup. Check:

```bash
cloudflared --version
```

If "command not found", install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/. macOS users can also `brew install cloudflared`.

### A2. Run a quick tunnel

The fast path — no Cloudflare account, no DNS, just a temporary URL good for testing:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflared will print something like:

```
Your quick Tunnel has been created! Visit it at:
https://able-mongoose-some-words.trycloudflare.com
```

Copy that URL. Your webhook URL is that URL plus `/webhooks/whatsapp`, e.g.:

```
https://able-mongoose-some-words.trycloudflare.com/webhooks/whatsapp
```

Leave the cloudflared command running in its terminal. (Open a second terminal for the next steps.)

> **Caveat:** quick tunnels get a new random URL every restart. Fine for testing. For production / your demo, run a named tunnel with a real subdomain — see Cloudflare's docs.

### A3. Quick smoke test

In another terminal, hit the new URL:

```bash
curl https://your-quick-tunnel-url.trycloudflare.com/health
```

You should see `{"status":"Server is running",...}` from your laptop.

---

## B — Meta WhatsApp Business setup

### B1. Create a Meta developer app

1. Go to https://developers.facebook.com/ and log in (use your normal Facebook account or create a developer one).
2. Top right → **My Apps** → **Create App**.
3. Use case: **Other** → Continue.
4. App type: **Business** → Continue.
5. App name: `FrontDesk AI`. Contact email: yours. Business Account: leave default or create a new Meta Business Account if prompted.
6. Click **Create app**.

### B2. Add the WhatsApp product

1. In the app dashboard sidebar, find **Add products** (or look at the top of the dashboard).
2. Find **WhatsApp** → **Set up**.
3. Pick or create a Meta Business Account when prompted.

### B3. Test phone number + access token

You're now on the **WhatsApp → API Setup** page. This page gives you a free **test number** and a **temporary access token** valid for 24 hours.

Copy these three things:

| What | Where on the page | Goes into `.env` as |
|---|---|---|
| Phone number ID | "From" section, the "Phone number ID" line — NOT the actual phone number | `WHATSAPP_PHONE_NUMBER_ID` |
| Temporary access token | Big blue "Temporary access token" box | `WHATSAPP_ACCESS_TOKEN` |
| (No need to copy the actual phone) | "From" section | — |

> **Token only lasts 24 hours.** For real use, generate a permanent **System User Access Token** later (Business Settings → System Users → Add → name it "FrontDesk Server" → assign your WhatsApp Business Account with full control → Generate New Token → select your app, set token to "Never" expiry, scopes `whatsapp_business_messaging` + `whatsapp_business_management`). Replace the temporary token in `.env`.

### B4. Pick a verify token (any string)

Make up a random string — this is a shared secret between your server and Meta. Example:

```
WHATSAPP_VERIFY_TOKEN=frontdesk-abcdef-12345
```

It can be anything. You'll paste the **same** string in Meta's webhook config in B6.

### B5. (Recommended) Grab the App Secret

1. In your Meta app, sidebar → **App settings → Basic**.
2. Find **App Secret** → click **Show** (may need to confirm password).
3. Copy it into `.env` as `WHATSAPP_APP_SECRET`. This lets the server verify that webhooks actually came from Meta (HMAC SHA-256 signature check).

### B6. Configure the webhook

1. Sidebar → **WhatsApp → Configuration** (or "Webhooks" depending on UI version).
2. **Callback URL:** paste your Cloudflare Tunnel webhook URL — `https://your-tunnel.trycloudflare.com/webhooks/whatsapp`
3. **Verify token:** paste the SAME string you put in `WHATSAPP_VERIFY_TOKEN`.
4. Make sure your server is running. (`node src/server.js` in another terminal — and the cloudflared tunnel pointing at it.)
5. Click **Verify and save**. Meta will GET your webhook URL with the verify token; the server checks it matches and replies with the challenge. If your `.env` is wrong or the server isn't running, this step fails — check server logs.
6. Once verified, you'll see "Webhook fields" — find **messages** and click **Subscribe**. (You don't need the others for this.)

### B7. Whitelist the phone(s) you'll test from

Since you're using the test number, Meta only delivers messages from numbers you've added.

1. **WhatsApp → API Setup** page → "To" section → **Manage phone number list** → add up to 5 numbers. Each gets an SMS code to verify.
2. Add your own phone first.

### B8. Update .env on the server

```
WHATSAPP_PHONE_NUMBER_ID=<from B3>
WHATSAPP_ACCESS_TOKEN=<from B3>
WHATSAPP_VERIFY_TOKEN=<from B4>
WHATSAPP_APP_SECRET=<from B5, optional>
```

Restart the server:

```bash
# stop with Ctrl+C, then:
node src/server.js
```

### B9. Send a test message

From a phone you whitelisted in B7, message the test number from your Meta dashboard. You should see in the server logs:

```
[WhatsApp] (no error logs)
```

And get an AI reply on your phone within a couple seconds. Open the dashboard `http://localhost:3000/admin.html` → Customers → you'll see a new row tagged **WhatsApp** with the conversation in it.

---

## Common issues

- **"Verify and save" fails in Meta.** Server isn't reachable from the internet. Test the URL with curl from a different network (your phone on cellular). Check the cloudflared terminal is still running.
- **Webhook verifies fine, but no messages received.** You likely forgot to **Subscribe** to the `messages` field in B6 step 6. Or your test number isn't whitelisted (B7).
- **AI replies are returning errors.** Check Anthropic credits — `ANTHROPIC_API_KEY` is right but the account is out of credits. Server logs will show `Your credit balance is too low`.
- **"bad signature" in server logs.** `WHATSAPP_APP_SECRET` is set but doesn't match the actual app secret. Either fix it or unset the env var (signature check skips when not set).
- **Token expires every 24h.** Switch to a permanent System User Token (B3 note).

## Going to production

Test number is limited to 5 recipients. To use a real business number:

1. Add your business number to Meta WABA: WhatsApp → Phone Numbers → Add phone number. Verify via SMS or call.
2. Display name needs Meta approval (~24h).
3. Generate a permanent System User Token (B3 note).
4. Replace your quick Cloudflare tunnel with a named tunnel using your own domain (`https://chat.yourbusiness.com/webhooks/whatsapp`).
5. Update `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` in `.env`.
6. Re-verify webhook in Meta dashboard with the new URL.
