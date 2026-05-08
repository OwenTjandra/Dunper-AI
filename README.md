# Dunper AI marketing site (dunper.com)

Static landing page. No build step — just HTML/CSS/JS. Deploys via Cloudflare Pages.

## Local preview

Open `website/index.html` in your browser. (Or run a tiny static server: `npx serve website`.)

## Deploy to Cloudflare Pages

1. Push this repo to GitHub (already done).
2. Go to https://dash.cloudflare.com/ → log in (or sign up — free).
3. Sidebar → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
4. Authorize Cloudflare to read the `OwenTjandra/FrontDesk` repo.
5. Project settings:
   - **Framework preset:** None
   - **Build command:** *(leave blank)*
   - **Build output directory:** `website`
   - **Root directory (advanced):** `website`
6. Click **Save and Deploy**. ~30 seconds later you have a URL like `dunper-ai.pages.dev`.

## Connect dunper.com (custom domain)

The domain is currently registered at GoDaddy. Cleanest path is to move DNS to Cloudflare — you keep GoDaddy as the registrar but Cloudflare handles DNS (this gives you free CDN, SSL, email forwarding, etc.).

### Step 1 — Add the domain to Cloudflare

1. In Cloudflare dashboard → **Add a site** → enter `dunper.com` → Free plan.
2. Cloudflare scans your existing DNS records. Confirm.
3. Cloudflare gives you **two nameservers** like `lola.ns.cloudflare.com` / `nick.ns.cloudflare.com`.

### Step 2 — Switch nameservers at GoDaddy

1. Log into https://www.godaddy.com/.
2. **My Products** → find dunper.com → **DNS**.
3. Find **Nameservers** section → **Change**.
4. Choose **I'll use my own nameservers** → paste the two Cloudflare nameservers from above.
5. Save. Propagation takes 5 min – 24 hours, usually under 1 hour.

### Step 3 — Attach the custom domain to the Pages project

1. Cloudflare dashboard → **Workers & Pages** → your Dunper project → **Custom domains** → **Set up a custom domain**.
2. Enter `dunper.com` (and also `www.dunper.com` if you want both).
3. Cloudflare creates the right CNAME automatically. SSL provisions in ~1 minute.

You're live.

## Things you'll want to update before sharing publicly

- **Hero tagline** — currently shows `[Tagline goes here]` placeholder in `index.html`.
- **Demo URL** — the `window.DUNPER_DEMO_URL` line at the top of `index.html`. The Cloudflare quick-tunnel URL changes every restart. For permanent deployment, set up a Cloudflare named tunnel pointing at `chat.dunper.com` and put that here.
- **Pricing** — currently all "TBD". Set actual numbers once you decide.
- **Form deliverability** — first time someone submits the form, FormSubmit.co sends a confirmation email to `dunperai@gmail.com`. Click the link in that email once to activate the form.

## Optional: hello@dunper.com email

Free via Cloudflare Email Routing once the domain is on Cloudflare:
1. Cloudflare dashboard → your domain → **Email** → **Email Routing**.
2. Enable. Add a destination address (e.g. `dunperai@gmail.com`).
3. Add a route: `hello@dunper.com` → forward to `dunperai@gmail.com`.
4. Update `index.html` and `style.css` references from `dunperai@gmail.com` to `hello@dunper.com`.
