# Mac mini setup runbook

Step-by-step for setting up Dunper on a fresh Mac mini. Maps to Phase 1
of `docs/mac-mini-scaling-plan.md`. Assumes you already bought the Mac
mini (M4, 16GB, 512GB recommended).

Estimated time: **~1 day from unboxing to dunper.com on the Mac mini**.

---

## 0. Before the Mac mini arrives

### Buy
- Mac mini M4 16GB 512GB (Apple Indonesia: Rp 12-13M)
- 1× USB-C to ethernet adapter if your home only has Wi-Fi (~Rp 200k) — wired is more reliable for a server
- A small UPS (uninterruptible power supply, ~Rp 500-1M) — even a cheap one saves the SQLite DB from corruption during power blips

### Decide
- **Where it lives**: somewhere with stable power, decent ventilation, hardwired internet if possible. Ideally not in a hot spot near the wall.
- **What hostname**: `dunper-mini-01.local` is a reasonable name. Set it during macOS first-run.

---

## 1. Day 1 — Initial macOS setup (~1 hour)

1. Power on. macOS first-run wizard:
   - Set computer name to `dunper-mini-01` (or similar)
   - Sign in with an Apple ID (for security updates and Find My)
   - Enable FileVault (encrypts the disk — important since this holds customer data)
   - Skip Touch ID / iCloud Drive (server doesn't need them)

2. After boot, in **System Settings**:
   - **Energy** → Disable display sleep, disable computer sleep, enable "Start up automatically after power failure"
   - **Sharing** → Enable Screen Sharing + Remote Login (SSH)
   - **General → Software Update** → Enable automatic security updates, disable major version auto-upgrades
   - **Lock Screen** → Disable auto-lock (or set to 1 hour — locking is fine, sleeping is not)

3. Install developer tools:
   ```bash
   # Open Terminal
   xcode-select --install
   ```
   Wait for it to finish.

4. Install Homebrew:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

5. Install Dunper's dependencies:
   ```bash
   brew install node git sqlite3 cloudflared tailscale
   ```

6. Sign in to Tailscale:
   ```bash
   sudo tailscale up
   # Follow the URL it prints, sign in via your Tailscale account
   ```
   Now you can SSH into the Mac mini from anywhere. Note the Tailscale IP it gets — you'll use it from your laptop.

---

## 2. Day 1 — Get Dunper running on the Mac mini (~1 hour)

7. Clone the repo:
   ```bash
   mkdir -p ~/Documents
   git clone https://github.com/OwenTjandra/Dunper-AI.git ~/Documents/Dunper-AI
   cd ~/Documents/Dunper-AI
   npm install
   ```

8. Copy `.env` from your laptop:
   ```bash
   # On your laptop:
   scp ~/Documents/Dunper-AI/.env owen@<tailscale-ip>:~/Documents/Dunper-AI/.env

   # Or use AirDrop and place the file manually.
   # NEVER commit .env to git.
   ```

9. Copy the live database:
   ```bash
   # On your laptop, dump latest data:
   cp ~/Documents/Dunper-AI/data.db ~/Documents/Dunper-AI/data.db.snapshot

   # SCP to Mac mini:
   scp ~/Documents/Dunper-AI/data.db.snapshot \
     owen@<tailscale-ip>:~/Documents/Dunper-AI/data.db
   ```

10. Smoke-test locally on the Mac mini:
    ```bash
    cd ~/Documents/Dunper-AI
    node src/server.js
    # In another terminal:
    curl http://localhost:3000/health
    # Expected: {"status":"Server is running","business":"Dunper AI"}
    ```
    Ctrl+C to stop.

---

## 3. Day 1 — Cloudflare Tunnel (~30 min)

The named tunnel on your laptop needs to move to the Mac mini.

11. On your **laptop**, find the tunnel UUID:
    ```bash
    cloudflared tunnel list
    # Note the UUID for the "dunper" tunnel.
    # Find its credentials file: ~/.cloudflared/<UUID>.json
    ```

12. Copy the tunnel credentials + config to the Mac mini:
    ```bash
    # On laptop:
    scp -r ~/.cloudflared owen@<tailscale-ip>:~/.cloudflared
    ```

13. On the Mac mini, test the tunnel:
    ```bash
    cloudflared tunnel run dunper
    # In another terminal:
    curl -s https://dunper.com/health
    # Expected: same JSON as step 10
    ```
    Ctrl+C.

14. **Stop the laptop's tunnel + Node server now** (so you don't have two boxes fighting):
    ```bash
    # On laptop, kill both:
    pkill -f "node src/server.js"
    pkill -f "cloudflared tunnel"
    ```

---

## 4. Day 1 — Register both as launchd services (~10 min)

This is the magic: now the Mac mini autoruns Dunper forever.

15. On the Mac mini:
    ```bash
    cd ~/Documents/Dunper-AI
    ./infra/launchd/install.sh
    ```
    The script:
    - Renders + loads `com.dunper.server.plist` → `launchctl` auto-starts node
    - Renders + loads `com.dunper.tunnel.plist` → `launchctl` auto-starts cloudflared
    - Both restart on crash and survive reboot

16. Verify:
    ```bash
    launchctl list | grep dunper
    # Expected: com.dunper.server  and  com.dunper.tunnel  both listed

    curl -s http://localhost:3000/health
    curl -s https://dunper.com/health
    # Both expected to return the JSON health payload
    ```

17. Test reboot:
    ```bash
    sudo reboot
    # Log back in (your services start automatically — no need to do anything)
    # From your laptop:
    curl -s https://dunper.com/health
    # Should still work
    ```

You're now on Phase 1 of the scaling plan. Mac mini owns dunper.com.

---

## 5. Day 2 (optional) — First paying customer

When you're ready to onboard a customer onto its own subdomain:

```bash
ssh owen@<tailscale-ip>
cd ~/Documents/Dunper-AI

./scripts/onboard-client.sh \
  --slug bellasalon \
  --business-name "Bella's Salon" \
  --business-type "hair salon" \
  --phone "+62 21 1234 5678" \
  --address "Jl Sudirman 1, Jakarta" \
  --admin-email owner@bellasalon.com
```

The script:
- Creates `~/dunper-workspaces/bellasalon/` with its own business.json + .env + data.db
- Registers `com.dunper.client.bellasalon.plist` with launchd on a fresh port (3001+)
- Adds the hostname route `bellasalon.dunper.com → http://localhost:3001` to your tunnel config

Then manually run:
```bash
# Add the DNS route:
cloudflared tunnel route dns dunper bellasalon.dunper.com

# Restart the tunnel to apply the new ingress rule:
launchctl unload ~/Library/LaunchAgents/com.dunper.tunnel.plist
launchctl load -w ~/Library/LaunchAgents/com.dunper.tunnel.plist
```

Then verify:
```bash
sleep 5
curl -s https://bellasalon.dunper.com/health
# Expected: {"status":"Server is running","business":"Bella's Salon"}
```

That's it. New customer is live.

---

## 6. Day 7 — UptimeRobot, R2 backups, monthly usage script

When you cross ~5 customers, build out Phase 2 ops tooling. Tracked
separately in `docs/mac-mini-scaling-plan.md` Phase 2 section.

---

## Troubleshooting

### Server isn't starting after reboot
```bash
launchctl list | grep dunper
# Look at the third column — should be a PID, not a number like "78"

# Tail the error log:
tail -50 ~/Documents/Dunper-AI/.logs/server.err.log

# Common causes:
#   - .env is missing or has wrong perms
#   - PORT 3000 is already in use by something else
#   - node_modules wasn't installed
```

### Tunnel is up but dunper.com returns 502
```bash
# Verify tunnel knows about ingress rules:
cat ~/.cloudflared/config.yml

# Restart tunnel after editing config:
launchctl unload ~/Library/LaunchAgents/com.dunper.tunnel.plist
launchctl load -w ~/Library/LaunchAgents/com.dunper.tunnel.plist
```

### Customer instance won't start
```bash
# Find which customer plist failed:
launchctl list | grep dunper.client

# Tail that customer's server log:
tail -50 ~/dunper-workspaces/<slug>/server.log
tail -50 ~/dunper-workspaces/<slug>/server.err.log
```

### Mac mini ran out of disk
```bash
# Check usage:
df -h ~

# Biggest offenders are usually:
#   - ~/dunper-workspaces/*/data.db.* (old backups)
#   - ~/dunper-workspaces/*/uploads/ (customer image uploads)
#   - /var/log/system.log (macOS log archives)

# Manual cleanup:
find ~/dunper-workspaces -name 'data-*.db' -mtime +30 -delete
```

---

## What this runbook does NOT cover

- Postgres migration (Phase 5 of the scaling plan)
- Multi-tenant rewrite (Phase 4 of the scaling plan)
- Stripe billing integration (separate doc when you're ready)
- WhatsApp Business Cloud API per-customer setup (Meta verification is its own dance)

Those are Phase 2+ concerns. Get Phase 1 right first.
