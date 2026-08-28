#!/bin/sh
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

python3 -c "
import json
import time

path = '/data/trackers.json'
try:
    with open(path, 'r') as f:
        data = json.load(f)
except Exception:
    data = {}

val = '''$val'''.strip()
label = '''$label'''.strip()
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
"

date +%s > /data/version.txt
echo "Successfully updated Production Tracker in trackers.json and refreshed the kiosk."
