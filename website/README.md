# Dunper AI marketing site (dunper.com)

Multi-page static site, plain HTML/CSS/JS, no build step. Deploys via Cloudflare Pages.

## Pages

- `index.html` → redirects to `dunper_home.html` (so `dunper.com/` works)
- `dunper_home.html` — landing page (hero, facts, how it works, demo)
- `dunper_about.html` — mission, values, timeline, team
- `dunper_services.html` — features, chatbot intelligence, booking, FAQs
- `dunper_join.html` — pricing tiers + monthly/yearly toggle + comparison table
- `dunper_contact.html` — contact form (formsubmit.co → dunperai@gmail.com)
- `dunper_signin.html` — sign in / sign up tabs

Shared JS at `js/common.js` handles the nav chatbar (opens the live demo in a new tab).

## Local preview

```bash
npx serve website
# or
python3 -m http.server 3001 --directory website
```

Then open http://localhost:3001/dunper_home.html.

## Deploy to Cloudflare Pages

1. Push to GitHub (already done — `OwenTjandra/FrontDesk`).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select `OwenTjandra/FrontDesk`. Project settings:
   - Framework preset: **None**
   - Build command: *(blank)*
   - Build output directory: `website`
   - Root directory (advanced): `website`
4. **Save and Deploy** → ~30 seconds → temporary URL like `dunper-ai.pages.dev`.

## Connect dunper.com

The domain is currently registered at GoDaddy. Cleanest path: move DNS to Cloudflare.

1. Cloudflare dashboard → **Add a site** → enter `dunper.com` → Free plan.
2. Cloudflare gives you 2 nameservers. Copy them.
3. GoDaddy → My Products → dunper.com → DNS → **Nameservers** → Change → "I'll use my own nameservers" → paste the two from Cloudflare.
4. Wait for propagation (usually < 1 hour).
5. Cloudflare Pages project → **Custom domains** → Set up → enter `dunper.com` (and `www.dunper.com`).
6. SSL provisions automatically. Site is live.

## Things to update before sharing publicly

- **Demo iframe URL** — in `js/common.js` the constant `DEMO_URL` points at the rotating Cloudflare quick-tunnel. Update when you switch to a permanent named tunnel like `app.dunper.com`.
- **Pricing numbers** — currently `$0 / $29 / $79` and yearly `$23 / $63`. Edit in `dunper_join.html` once you have real prices.
- **Contact email** — `dunperai@gmail.com` is wired throughout. If you set up `hello@dunper.com` via Cloudflare Email Routing, do a find-replace.
- **First-time form activation** — first time anyone submits the contact form (or the sign-up form), FormSubmit.co sends a confirmation email to `dunperai@gmail.com`. Click that link once to activate the form for real.

## Optional: hello@dunper.com email

Free via Cloudflare Email Routing once the domain is on Cloudflare:
1. Cloudflare → your domain → **Email** → **Email Routing** → enable.
2. Add destination `dunperai@gmail.com` (verify it).
3. Add route `hello@dunper.com` → forward to `dunperai@gmail.com`.
4. Find-replace `dunperai@gmail.com` → `hello@dunper.com` across `*.html`.
