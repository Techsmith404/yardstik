#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/data}"
label=""
val=""

while getopts "l:v:r:" flag
do
    case "${flag}" in
        l) label=${OPTARG};;
        v) val=${OPTARG};;
        r) val=${OPTARG};;
    esac
done

# SECURITY: Pass val and label as environment variables instead of interpolating them into the
# Python code string. Directly embedding $val/$label inside '''$val''' allows triple-quote
# escape injection — an attacker who controls the value could execute arbitrary Python code.
BLEND_VAL="$val" BLEND_LABEL="$label" DATA_DIR="$DATA_DIR" python3 - <<'PYEOF'
import json
import time
import os

data_dir = os.environ.get('DATA_DIR', '/data')
path = os.path.join(data_dir, 'trackers.json')
try:
    with open(path, 'r') as f:
        data = json.load(f)
except Exception:
    data = {}

val = (os.environ.get('BLEND_VAL') or '').strip()
label = (os.environ.get('BLEND_LABEL') or '').strip()
now_ms = int(time.time() * 1000)

if val:
    data['production_tracker_value'] = val
    data['blend_recipe'] = val
    data['production_tracker_updated_at'] = now_ms
    data['blend_recipe_updated_at'] = now_ms

if label:
    data['production_tracker_label'] = label

with open(path, 'w') as f:
    json.dump(data, f, indent=4)
PYEOF

date +%s > "$DATA_DIR/version.txt"
echo "Successfully updated Production Tracker in trackers.json and refreshed the kiosk."
