#!/bin/sh

# 1. Fire up folder scripts immediately on initialization so page isn't blank on boot
echo "Pre-populating layout asset manifests..."
ls /usr/share/nginx/html/assets/safety-slides | jq -R -s -c 'split("\n")[:-1]' > /usr/share/nginx/html/assets/data/safety.json 2>/dev/null || true

# 2. Fire up the cron daemon in background mode
echo "Launching cron engine daemon..."
crond -b -L /var/log/cron.log

# 3. Fire up the core web server in the foreground
echo "Starting Nginx web server..."
exec nginx -g "daemon off;"
