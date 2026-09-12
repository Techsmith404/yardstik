#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/data}"
date=""
while getopts d: flag
do
    case "${flag}" in
        d) date=${OPTARG};;
    esac
done
echo "Updating OSHA Safe Date to: $date"
# SECURITY: Validate date format (YYYY-MM-DD) before interpolating into sed to prevent shell injection.
if ! echo "$date" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
    echo "Error: Invalid date format. Expected YYYY-MM-DD."
    exit 1
fi
OSHA_DATE="$date" DATA_DIR="$DATA_DIR" python3 - <<'PYEOF'
import json, os
data_dir = os.environ.get('DATA_DIR', '/data')
path = os.path.join(data_dir, 'trackers.json')
try:
    with open(path, 'r') as f:
        data = json.load(f)
except Exception:
    data = {}

d = (os.environ.get('OSHA_DATE') or '').strip()
if d:
    data['last_incident_date'] = d
    with open(path, 'w') as f:
        json.dump(data, f, indent=4)
PYEOF
date +%s > "$DATA_DIR/version.txt"
echo "Successfully updated trackers.json and refreshed the kiosk."
