#!/bin/bash
# Triggers a manual track spreadsheet scan and bumps the kiosk reload version.
set -euo pipefail
DATA_DIR="${DATA_DIR:-/data}"

echo "Triggering manual asset scan and data refresh..."
PARSER_SCRIPT="${PARSER_SCRIPT:-/app/scripts/parse_track_check.py}"
if [ ! -f "$PARSER_SCRIPT" ] && [ -f "$(dirname "$0")/parse_track_check.py" ]; then
    PARSER_SCRIPT="$(dirname "$0")/parse_track_check.py"
fi

if [ -f "$PARSER_SCRIPT" ]; then
    if ! python3 "$PARSER_SCRIPT"; then
        echo "WARNING: Track scan parser exited with errors." >&2
    fi
fi
date +%s > "${DATA_DIR}/version.txt"
echo "Scan completed. Kiosk web page is automatically refreshing..."
