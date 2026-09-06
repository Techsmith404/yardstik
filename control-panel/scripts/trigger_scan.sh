#!/bin/bash
echo "Triggering manual asset scan and data refresh..."
if [ -f "/app/scripts/parse_track_check.py" ]; then
    python3 /app/scripts/parse_track_check.py 2>/dev/null || true
fi
date +%s > /data/version.txt
echo "Scan completed. Kiosk web page is automatically refreshing..."
