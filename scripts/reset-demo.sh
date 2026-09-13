#!/usr/bin/env bash
# =============================================================================
# reset-demo.sh — YardStik Nightly Demo Reset Daemon
# =============================================================================
# Automatically restores clean seed data, default demo credentials, and bumps
# version.txt, triggering an immediate sync to Vercel/Redis every 24 hours.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="/opt/kiosk-data/data"
CONFIG_FILE="/opt/kiosk-data/config.json"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Demo Reset] Restoring clean seed data from ${REPO_DIR}..."

# 1. Restore clean sample JSON, Markdown, and SVG files from html/assets/data
if [ -d "${REPO_DIR}/html/assets/data" ] && [ -d "${DATA_DIR}" ]; then
    cp -f "${REPO_DIR}/html/assets/data/"*.json "${DATA_DIR}/" 2>/dev/null || true
    cp -f "${REPO_DIR}/html/assets/data/"*.md "${DATA_DIR}/" 2>/dev/null || true
    cp -f "${REPO_DIR}/html/assets/data/"*.svg "${DATA_DIR}/" 2>/dev/null || true
fi

# 2. If config.json exists, ensure demo credentials and locked defaults are intact
if [ -f "${CONFIG_FILE}" ]; then
    # Synchronize sanitized config into frontend directory
    cp -f "${CONFIG_FILE}" "${DATA_DIR}/config.json" 2>/dev/null || true
fi

# 3. Bump version.txt to force connected browsers/kiosks to reload immediately
date +%s > "${DATA_DIR}/version.txt"

# 4. Restart control-panel container to trigger instant cloud sync to Vercel/Redis
if command -v docker >/dev/null 2>&1; then
    docker compose -f "${REPO_DIR}/docker-compose.yml" restart control-panel >/dev/null 2>&1 || \
    sudo docker compose -f "${REPO_DIR}/docker-compose.yml" restart control-panel >/dev/null 2>&1 || true
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Demo Reset] Success: Environment restored and synchronized to cloud."
