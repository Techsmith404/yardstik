#!/bin/bash
# =============================================================================
# dev-sync.sh — Dev-Test Staging Auto Git Sync & Container Lifecycle Manager
# =============================================================================
# Synchronizes the staging environment with origin/dev-test on Andromeda.
# Tears down, removes, and cleans up any old staging containers before building
# and recreating fresh containers with isolated dev-test ports and networks.
#
# Path on Andromeda: /opt/docker/kiosk-dev/dev-sync.sh
# =============================================================================

set -euo pipefail

REPO_DIR="${DEV_REPO_DIR:-/opt/docker/kiosk-dev/kiosk-app}"
DATA_DIR="${DEV_DATA_DIR:-/opt/docker/kiosk-dev/kiosk-data/data}"
LOG_FILE="${DEV_LOG_FILE:-/opt/docker/kiosk-dev/sync.log}"
COMPOSE_FILE="${DEV_COMPOSE_FILE:-docker-compose.dev.yml}"
BRANCH="${BRANCH:-dev-test}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$REPO_DIR"
log "====== Dev-Test Sync Started (Branch: $BRANCH) ======"

log "Checking for updates on origin/$BRANCH..."
BEFORE_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
AFTER_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")

# Force rebuild if requested via --force argument or if git hash changed
FORCE_BUILD="${1:-}"

if [ "$BEFORE_HASH" != "$AFTER_HASH" ] || [ "$FORCE_BUILD" = "--force" ]; then
    log "Updates detected ($BEFORE_HASH -> $AFTER_HASH). Performing clean container rebuild..."

    # 1. Gracefully tear down the existing compose stack and remove orphans
    log "Stopping and removing existing dev-test containers..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans || true

    # 2. Defensive cleanup: force-remove any lingering container instances
    docker rm -f yardstik-dev-app yardstik-dev-control-panel 2>/dev/null || true

    # 3. Build images and recreate containers with fresh volume mounts & network aliases
    log "Building images and launching containers..."
    docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate

    # 4. Bump version.txt in dev-test ephemeral data to trigger browser hot-reload
    mkdir -p "$DATA_DIR"
    echo "$(date +%s%3N)" > "$DATA_DIR/version.txt"
    log "Bumped dev-test version.txt for browser live reload."

    # 5. Verify containers are active
    sleep 2
    RUNNING_COUNT=$(docker ps --filter "name=yardstik-dev" --filter "status=running" -q | wc -l)
    if [ "$RUNNING_COUNT" -ge 2 ]; then
        log "✅ Dev-Test services successfully launched and healthy (2/2 running)."
    else
        log "⚠️ Warning: Expected 2 containers running, found $RUNNING_COUNT. Check docker logs."
    fi
else
    log "Already up to date ($AFTER_HASH). No rebuild needed."
fi

log "====== Dev-Test Sync Complete ======"
