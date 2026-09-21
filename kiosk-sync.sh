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

set -euo pipefail

REPO_DIR="${KIOSK_REPO_DIR:-$HOME/kiosk-app}"
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

LAST_BUILT_FILE="/opt/kiosk-data/data/.last_built_commit"
LAST_BUILT_HASH=$(cat "$LAST_BUILT_FILE" 2>/dev/null || echo "none")

# Trigger build/restart if git pulled new commits OR if current HEAD hasn't been built yet
if [ "$BEFORE_HASH" != "$AFTER_HASH" ] || [ "$AFTER_HASH" != "$LAST_BUILT_HASH" ]; then
    log "Build or service update required (HEAD: $AFTER_HASH, Built: $LAST_BUILT_HASH)..."
    
    # Bump version.txt in ephemeral data to trigger a live browser reload on the TV
    if [ -d "/opt/kiosk-data/data" ]; then
        echo "$(date +%s)" > "/opt/kiosk-data/data/version.txt"
    else
        echo "$(date +%s)" > "$REPO_DIR/html/assets/data/version.txt" 2>/dev/null || true
    fi

    # Recreate / rebuild containers to apply any server.js, dependency, or compose changes
    if docker compose up -d --build --remove-orphans; then
        echo "$AFTER_HASH" > "$LAST_BUILT_FILE" 2>/dev/null || true
        log "Kiosk services built, updated, and reloaded."
    else
        log "Warning: docker compose build failed, attempting restart..."
        docker compose restart control-panel >/dev/null 2>&1 || true
    fi
else
    log "Already up to date and built ($AFTER_HASH). No restart needed."
fi

log "====== Kiosk Sync Complete ======"
