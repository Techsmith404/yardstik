#!/bin/bash
# =============================================================================
# kiosk-sync.sh — Kiosk Auto Git Sync
# =============================================================================
# Pulls the latest code from origin/main.
# Ephemeral data (reminders, metrics, etc.) lives in /opt/kiosk-data/ and is
# mounted into Docker via volumes — it is NOT in git and is never touched here.
#
# Setup: Add to crontab via `crontab -e`
#   */15 * * * * ~/kiosk-app/kiosk-sync.sh >> ~/kiosk-app/sync.log 2>&1
# =============================================================================

set -e

REPO_DIR="$HOME/kiosk-app"
LOG_FILE="$REPO_DIR/sync.log"
BRANCH="main"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$REPO_DIR"
log "====== Kiosk Sync Started ======"

log "Checking for updates on origin/$BRANCH..."
BEFORE_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
AFTER_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")

if [ "$BEFORE_HASH" != "$AFTER_HASH" ]; then
    log "New updates detected ($BEFORE_HASH -> $AFTER_HASH). Applying changes..."
    
    # Bump version.txt in ephemeral data to trigger a live browser reload on the TV
    if [ -d "/opt/kiosk-data/data" ]; then
        echo "$(date +%s)" > "/opt/kiosk-data/data/version.txt"
    else
        echo "$(date +%s)" > "$REPO_DIR/html/assets/data/version.txt" 2>/dev/null || true
    fi

    # Recreate / restart containers to apply any server.js or compose changes
    docker compose up -d --remove-orphans >/dev/null 2>&1 || docker compose restart control-panel >/dev/null 2>&1 || true
    log "Kiosk services updated and reloaded."
else
    log "Already up to date. No restart needed."
fi

log "====== Kiosk Sync Complete ======"
