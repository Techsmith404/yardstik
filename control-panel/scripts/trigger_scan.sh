#!/bin/bash
# Triggers a manual track spreadsheet scan and bumps the kiosk reload version.
set -euo pipefail
DATA_DIR="${DATA_DIR:-/data}"

echo "Triggering manual asset scan and data refresh..."
if [ -f "/app/scripts/parse_track_check.py" ]; then
    if ! python3 /app/scripts/parse_track_check.py; then
        echo "WARNING: Track scan parser exited with errors." >&2
    fi
fi
date +%s > "${DATA_DIR}/version.txt"
echo "Scan completed. Kiosk web page is automatically refreshing..."
