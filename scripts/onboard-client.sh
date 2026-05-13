#!/usr/bin/env bash
# Provision a new customer instance on the same Mac mini / host.
#
# One Dunper codebase, many customers. Each customer gets:
#   - Their own workspace dir under $WORKSPACES_ROOT/$slug/
#   - Their own business.json, .env, data.db, uploads/
#   - Their own port (3001+)
#   - A launchd plist (macOS) or systemd unit (Linux) registered to autostart
#   - A Cloudflare Tunnel route at https://{slug}.dunper.com
#
# Single-tenant per customer for now — see docs/scaling-roadmap.md.
# When multi-tenant lands (Phase 4 in docs/mac-mini-scaling-plan.md),
# this script gets retired in favour of "POST /api/workspaces".
#
# Usage:
#   ./scripts/onboard-client.sh --slug bellasalon \
#       --business-name "Bella's Salon" \
#       --business-type "hair salon" \
#       --phone "+62 21 1234 5678" \
#       --address "Jl Sudirman 1, Jakarta" \
#       [--port 3005]              # auto-picks next free port if omitted
#       [--tone "warm, conversational"]
#       [--admin-email owner@bellasalon.com]
#       [--admin-username bella]
#       [--dry-run]                # show what would happen, change nothing
#
# Idempotent: re-running with the same --slug refuses to overwrite an
# existing workspace. Use --force to wipe and recreate (DESTRUCTIVE).

set -euo pipefail

DUNPER_REPO="${DUNPER_REPO:-$HOME/Documents/Dunper-AI}"
WORKSPACES_ROOT="${WORKSPACES_ROOT:-$HOME/dunper-workspaces}"
BASE_PORT="${BASE_PORT:-3001}"
TUNNEL_NAME="${TUNNEL_NAME:-dunper}"
DOMAIN="${DUNPER_DOMAIN:-dunper.com}"

# ---------------- arg parsing ----------------
SLUG=""
NAME=""
TYPE=""
PHONE=""
ADDRESS=""
TONE="Warm, professional, and helpful."
PORT=""
ADMIN_EMAIL=""
ADMIN_USERNAME=""
DRY=0
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)           SLUG="$2"; shift 2 ;;
    --business-name)  NAME="$2"; shift 2 ;;
    --business-type)  TYPE="$2"; shift 2 ;;
    --phone)          PHONE="$2"; shift 2 ;;
    --address)        ADDRESS="$2"; shift 2 ;;
    --tone)           TONE="$2"; shift 2 ;;
    --port)           PORT="$2"; shift 2 ;;
    --admin-email)    ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-username) ADMIN_USERNAME="$2"; shift 2 ;;
    --dry-run)        DRY=1; shift ;;
    --force)          FORCE=1; shift ;;
    -h|--help)        sed -n '1,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ---------------- validate ----------------
require() {
  local var="$1" val="$2" hint="$3"
  if [[ -z "$val" ]]; then
    echo "Error: $var required. $hint" >&2; exit 1
  fi
}
require "--slug"          "$SLUG"    "Pick a short URL-safe name, e.g. bellasalon."
require "--business-name" "$NAME"    "Customer-facing business name."
require "--business-type" "$TYPE"    "e.g. 'hair salon', 'dental clinic'."
require "--phone"         "$PHONE"   "Customer contact phone."
require "--address"       "$ADDRESS" "Customer business address."

if ! [[ "$SLUG" =~ ^[a-z][a-z0-9-]{1,30}$ ]]; then
  echo "Error: --slug must be 2-31 chars, lowercase letters/digits/dashes, starting with a letter." >&2
  exit 1
fi

[[ -d "$DUNPER_REPO" ]] || { echo "Error: Dunper repo not found at $DUNPER_REPO. Set DUNPER_REPO env var." >&2; exit 1; }

# ---------------- pick a port ----------------
pick_free_port() {
  local p="$BASE_PORT"
  while [[ -d "$WORKSPACES_ROOT" ]] && grep -rqsh "^PORT=$p\$" "$WORKSPACES_ROOT"/*/.env 2>/dev/null; do
    p=$((p + 1))
  done
  echo "$p"
}
if [[ -z "$PORT" ]]; then
  PORT="$(pick_free_port)"
fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "Error: --port must be 1024-65535." >&2; exit 1
fi

WS_DIR="$WORKSPACES_ROOT/$SLUG"
LAUNCHD_LABEL="com.dunper.client.$SLUG"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"

# ---------------- existence check ----------------
if [[ -d "$WS_DIR" ]]; then
  if [[ "$FORCE" -eq 1 ]]; then
    echo "Warning: --force given, will WIPE $WS_DIR"
  else
    echo "Error: workspace already exists at $WS_DIR. Pass --force to overwrite." >&2
    exit 1
  fi
fi

# ---------------- summary ----------------
echo "--- Onboard plan ---"
echo "  Slug:              $SLUG"
echo "  Workspace dir:     $WS_DIR"
echo "  Port:              $PORT"
echo "  Public URL:        https://${SLUG}.${DOMAIN}"
echo "  Business name:     $NAME"
echo "  Business type:     $TYPE"
echo "  Launchd label:     $LAUNCHD_LABEL"
echo "  Cloudflare tunnel: $TUNNEL_NAME"
[[ -n "$ADMIN_EMAIL"    ]] && echo "  Admin email:       $ADMIN_EMAIL"
[[ -n "$ADMIN_USERNAME" ]] && echo "  Admin username:    $ADMIN_USERNAME"
[[ "$DRY" -eq 1 ]] && echo "  DRY RUN — nothing will be written" || true
echo

if [[ "$DRY" -eq 1 ]]; then
  exit 0
fi

# ---------------- provision ----------------
[[ -d "$WS_DIR" && "$FORCE" -eq 1 ]] && rm -rf "$WS_DIR"
mkdir -p "$WS_DIR"/{uploads/business,uploads/customer,backups,public-uploads/business-logos}

# Generate business.json
cat > "$WS_DIR/business.json" <<EOF
{
  "name": "$NAME",
  "type": "$TYPE",
  "hours": "Monday to Friday, 9:00 AM - 5:00 PM. Closed weekends and public holidays.",
  "address": "$ADDRESS",
  "phone": "$PHONE",
  "tone": "$TONE",
  "fallback_contact": "If a question is outside what you can help with, ask the customer to call us at $PHONE during business hours.",
  "services": [],
  "booking_rules": [
    "Appointments require at least 24 hours advance notice."
  ],
  "weekly_hours": {
    "mon": { "open": "09:00", "close": "17:00", "closed": false },
    "tue": { "open": "09:00", "close": "17:00", "closed": false },
    "wed": { "open": "09:00", "close": "17:00", "closed": false },
    "thu": { "open": "09:00", "close": "17:00", "closed": false },
    "fri": { "open": "09:00", "close": "17:00", "closed": false },
    "sat": { "open": "09:00", "close": "13:00", "closed": true },
    "sun": { "open": "09:00", "close": "13:00", "closed": true }
  },
  "blocked_dates": []
}
EOF

# Copy .env template from the main repo and override key paths.
if [[ -f "$DUNPER_REPO/.env" ]]; then
  cp "$DUNPER_REPO/.env" "$WS_DIR/.env"
elif [[ -f "$DUNPER_REPO/.env.example" ]]; then
  cp "$DUNPER_REPO/.env.example" "$WS_DIR/.env"
else
  : > "$WS_DIR/.env"
fi
{
  echo ""
  echo "# --- generated by onboard-client.sh for slug=$SLUG ---"
  echo "PORT=$PORT"
  echo "BUSINESS_PATH=$WS_DIR/business.json"
  echo "DATABASE_PATH=$WS_DIR/data.db"
  echo "UPLOADS_DIR=$WS_DIR/uploads"
  echo "PUBLIC_UPLOADS_DIR=$WS_DIR/public-uploads"
  echo "BACKUP_DIR=$WS_DIR/backups"
  [[ -n "$ADMIN_EMAIL"    ]] && echo "ADMIN_EMAIL=$ADMIN_EMAIL"
  [[ -n "$ADMIN_USERNAME" ]] && echo "ADMIN_USERNAME=$ADMIN_USERNAME"
} >> "$WS_DIR/.env"

# ---------------- launchd plist (macOS) ----------------
if [[ "$(uname)" == "Darwin" ]]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$LAUNCHD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCHD_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>bash</string>
    <string>-lc</string>
    <string>cd "$DUNPER_REPO" && export \$(grep -v '^#' "$WS_DIR/.env" | xargs) && exec node src/server.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>WorkingDirectory</key>
  <string>$DUNPER_REPO</string>
  <key>StandardOutPath</key>
  <string>$WS_DIR/server.log</string>
  <key>StandardErrorPath</key>
  <string>$WS_DIR/server.err.log</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
EOF
  echo "Created launchd plist: $LAUNCHD_PLIST"
  echo "Loading service..."
  launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
  launchctl load -w "$LAUNCHD_PLIST"
  echo "Loaded. Service will autostart on boot."
fi

# ---------------- Cloudflare Tunnel hostname route ----------------
TUNNEL_CONFIG="$HOME/.cloudflared/config.yml"
if [[ -f "$TUNNEL_CONFIG" ]]; then
  HOSTNAME="${SLUG}.${DOMAIN}"
  if grep -qE "hostname:\s*${HOSTNAME}(\s|\$)" "$TUNNEL_CONFIG"; then
    echo "Tunnel route ${HOSTNAME} already in $TUNNEL_CONFIG — leaving alone."
  else
    echo "Adding ${HOSTNAME} -> http://localhost:$PORT to $TUNNEL_CONFIG"
    # Insert before the catch-all rule (service: http_status:404 typically last).
    awk -v host="$HOSTNAME" -v port="$PORT" '
      /service:\s*http_status:404/ && !inserted {
        print "  - hostname: " host
        print "    service: http://localhost:" port
        inserted = 1
      }
      { print }
    ' "$TUNNEL_CONFIG" > "${TUNNEL_CONFIG}.tmp" && mv "${TUNNEL_CONFIG}.tmp" "$TUNNEL_CONFIG"
    echo
    echo "NEXT: also create the DNS route in Cloudflare:"
    echo "    cloudflared tunnel route dns $TUNNEL_NAME $HOSTNAME"
    echo "Then restart the tunnel to apply:"
    echo "    launchctl unload ~/Library/LaunchAgents/com.dunper.tunnel.plist 2>/dev/null"
    echo "    launchctl load -w ~/Library/LaunchAgents/com.dunper.tunnel.plist"
  fi
else
  echo "Note: $TUNNEL_CONFIG not found. Cloudflare Tunnel not configured on this host."
  echo "Customer will reach the service at http://localhost:$PORT only."
fi

# ---------------- final summary ----------------
echo
echo "DONE. Customer $SLUG provisioned."
echo
echo "Health check:"
echo "  sleep 5 && curl -s http://localhost:$PORT/health"
echo
echo "View server log:"
echo "  tail -f $WS_DIR/server.log"
echo
echo "If admin user wasn't auto-seeded, run:"
echo "  cd $DUNPER_REPO && \\"
echo "  BUSINESS_PATH=$WS_DIR/business.json \\"
echo "  DATABASE_PATH=$WS_DIR/data.db \\"
echo "  node scripts/reset-admin-password.js"
