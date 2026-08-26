#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "========================================="
echo "🚀 Deploying Kiosk Update..."
echo "========================================="

INSTALL_DIR="$HOME/kiosk-app"
if [ "$PWD" != "$INSTALL_DIR" ]; then
    echo "[1/8] Shutting down old containers (if any)..."
    if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
        (cd "$INSTALL_DIR" && sudo docker compose down --remove-orphans || true)
    fi

    echo "[2/8] Backing up live user data..."
    TMP_BACKUP=$(mktemp -d)
    [ -f "$INSTALL_DIR/html/assets/data/reminders.md" ] && cp "$INSTALL_DIR/html/assets/data/reminders.md" "$TMP_BACKUP/"
    [ -f "$INSTALL_DIR/html/assets/data/equipment.json" ] && cp "$INSTALL_DIR/html/assets/data/equipment.json" "$TMP_BACKUP/"
    [ -f "$INSTALL_DIR/html/assets/data/trackers.json" ] && cp "$INSTALL_DIR/html/assets/data/trackers.json" "$TMP_BACKUP/"
    [ -f "$INSTALL_DIR/html/assets/data/special.json" ] && cp "$INSTALL_DIR/html/assets/data/special.json" "$TMP_BACKUP/"
    cp "$INSTALL_DIR/html/assets/data/"special_img.* "$TMP_BACKUP/" 2>/dev/null || true

    echo "[3/8] Wiping old installation and unpacking update..."
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    cp -r ./* "$INSTALL_DIR/"
    
    echo "[4/8] Restoring user data..."
    [ -f "$TMP_BACKUP/reminders.md" ] && cp "$TMP_BACKUP/reminders.md" "$INSTALL_DIR/html/assets/data/"
    [ -f "$TMP_BACKUP/equipment.json" ] && cp "$TMP_BACKUP/equipment.json" "$INSTALL_DIR/html/assets/data/"
    [ -f "$TMP_BACKUP/trackers.json" ] && cp "$TMP_BACKUP/trackers.json" "$INSTALL_DIR/html/assets/data/"
    [ -f "$TMP_BACKUP/special.json" ] && cp "$TMP_BACKUP/special.json" "$INSTALL_DIR/html/assets/data/"
    cp "$TMP_BACKUP/"special_img.* "$INSTALL_DIR/html/assets/data/" 2>/dev/null || true
    rm -rf "$TMP_BACKUP"

    cd "$INSTALL_DIR"
else
    echo "[1/8] Already running from $INSTALL_DIR. Skipping file move and backup..."
    echo "[2/8] Skipping backup..."
    echo "[3/8] Skipping wipe..."
    echo "[4/8] Skipping restore..."
fi

if [ ! -f "kiosk-webserver.tar" ]; then
    echo "❌ Error: kiosk-webserver.tar not found!"
    exit 1
fi

echo "[5/8] Loading new Docker image from tar archive..."
sudo docker load -i kiosk-webserver.tar

echo "[6/8] Spinning up new containers..."
sudo docker compose up -d --build --remove-orphans

echo "[7/8] Setting up midnight wipe cronjob for ~/tmp..."
TMP_CRON=$(mktemp)
crontab -l 2>/dev/null | grep -v "find $HOME/tmp -mindepth 1 -delete" > "$TMP_CRON" || true
echo "0 0 * * * find $HOME/tmp -mindepth 1 -delete" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "[8/8] Forcing Kiosk TV browser to live-reload..."
date +%s > html/assets/data/version.txt

echo "========================================="
echo "✅ Deployment Complete! The Kiosk is now running the latest version."
echo "========================================="
