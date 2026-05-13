#!/usr/bin/env bash
# Install Dunper as launchd services on a Mac mini.
#
# Two services get registered:
#   1. com.dunper.server  — Node app on port 3000
#   2. com.dunper.tunnel  — cloudflared named tunnel "dunper"
#
# Both are user agents (run as your user, not root). They start at login,
# survive crashes, and restart automatically.
#
# Usage:
#   ./infra/launchd/install.sh                 # install both
#   ./infra/launchd/install.sh --server-only   # skip tunnel
#   ./infra/launchd/install.sh --tunnel-only   # skip server
#   ./infra/launchd/install.sh --uninstall     # remove both
#
# Assumes:
#   - macOS, Apple Silicon (paths under /opt/homebrew)
#   - You've already run: brew install node cloudflared
#   - You've already run: cloudflared login && cloudflared tunnel create dunper
#   - ~/.cloudflared/config.yml exists with at least one ingress rule

set -euo pipefail

DUNPER_REPO="${DUNPER_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG_DIR="${LOG_DIR:-$DUNPER_REPO/.logs}"
TUNNEL_NAME="${TUNNEL_NAME:-dunper}"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
SERVER_PLIST="$LAUNCH_AGENTS_DIR/com.dunper.server.plist"
TUNNEL_PLIST="$LAUNCH_AGENTS_DIR/com.dunper.tunnel.plist"

SERVER_TEMPLATE="$DUNPER_REPO/infra/launchd/com.dunper.server.plist.template"
TUNNEL_TEMPLATE="$DUNPER_REPO/infra/launchd/com.dunper.tunnel.plist.template"

MODE="both"
if [[ "${1:-}" == "--server-only" ]]; then MODE="server"; fi
if [[ "${1:-}" == "--tunnel-only" ]]; then MODE="tunnel"; fi
if [[ "${1:-}" == "--uninstall" ]];   then MODE="uninstall"; fi

# ---------- sanity checks ----------
if [[ "$(uname)" != "Darwin" ]]; then
  echo "Error: this script is macOS-only. Use systemd on Linux." >&2; exit 1
fi
[[ -d "$DUNPER_REPO" ]] || { echo "Error: DUNPER_REPO not found at $DUNPER_REPO" >&2; exit 1; }

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

unload_if_present() {
  local plist="$1"
  if [[ -f "$plist" ]]; then
    launchctl unload "$plist" 2>/dev/null || true
  fi
}

# ---------- uninstall ----------
if [[ "$MODE" == "uninstall" ]]; then
  echo "Stopping + unloading services..."
  unload_if_present "$SERVER_PLIST"
  unload_if_present "$TUNNEL_PLIST"
  rm -f "$SERVER_PLIST" "$TUNNEL_PLIST"
  echo "Done. Plists removed. Logs at $LOG_DIR are preserved."
  exit 0
fi

# ---------- render + load: server ----------
if [[ "$MODE" == "both" || "$MODE" == "server" ]]; then
  [[ -f "$SERVER_TEMPLATE" ]] || { echo "Missing template: $SERVER_TEMPLATE" >&2; exit 1; }
  echo "Rendering server plist..."
  sed -e "s|{{DUNPER_REPO}}|$DUNPER_REPO|g" \
      -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
      "$SERVER_TEMPLATE" > "$SERVER_PLIST"
  unload_if_present "$SERVER_PLIST"
  launchctl load -w "$SERVER_PLIST"
  echo "  Loaded com.dunper.server. Logs: $LOG_DIR/server.log"
fi

# ---------- render + load: tunnel ----------
if [[ "$MODE" == "both" || "$MODE" == "tunnel" ]]; then
  [[ -f "$TUNNEL_TEMPLATE" ]] || { echo "Missing template: $TUNNEL_TEMPLATE" >&2; exit 1; }
  if [[ ! -d "$HOME/.cloudflared" ]]; then
    echo "Warning: ~/.cloudflared not found. Run \`cloudflared login\` and \`cloudflared tunnel create $TUNNEL_NAME\` first." >&2
  fi
  echo "Rendering tunnel plist..."
  sed -e "s|{{TUNNEL_NAME}}|$TUNNEL_NAME|g" \
      -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
      -e "s|{{HOME_DIR}}|$HOME|g" \
      "$TUNNEL_TEMPLATE" > "$TUNNEL_PLIST"
  unload_if_present "$TUNNEL_PLIST"
  launchctl load -w "$TUNNEL_PLIST"
  echo "  Loaded com.dunper.tunnel. Logs: $LOG_DIR/tunnel.log"
fi

# ---------- post ----------
echo
echo "Services registered. They will autostart on login + restart on crash."
echo
echo "Verify:"
echo "  launchctl list | grep dunper"
echo "  curl -s http://localhost:3000/health"
echo "  curl -s https://dunper.com/health"
echo
echo "Tail logs:"
echo "  tail -f $LOG_DIR/server.log"
echo "  tail -f $LOG_DIR/tunnel.log"
echo
echo "To restart after a config change:"
echo "  launchctl unload $SERVER_PLIST && launchctl load -w $SERVER_PLIST"
echo
echo "To uninstall:"
echo "  $0 --uninstall"
