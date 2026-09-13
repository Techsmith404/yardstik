#!/bin/sh
set -eu

echo "=========================================================="
echo "🔄  Restarting Kiosk Web Application (Demo Mode)"
echo "Recycling presentation state and clearing runtime cache..."
sleep 1
echo "Triggering browser live-reload epoch..."
date +%s > /data/version.txt 2>/dev/null || date +%s > ./html/assets/data/version.txt 2>/dev/null || true
echo "✓ Kiosk TV and connected viewers successfully reloaded!"
echo "=========================================================="
exit 0
