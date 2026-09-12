#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/data}"
file=""
action=""
while getopts f:a: flag
do
    case "${flag}" in
        f) file=${OPTARG};;
        a) action=${OPTARG};;
    esac
done

if [ "$action" = "Clear Current Override" ]; then
    DATA_DIR="$DATA_DIR" python3 -c '
import json, os
data_dir = os.environ.get("DATA_DIR", "/data")
path = os.path.join(data_dir, "trackers.json")
try:
    with open(path, "r") as f:
        data = json.load(f)
    data["toolbox_override_date"] = ""
    with open(path, "w") as f:
        json.dump(data, f, indent=4)
except Exception as e:
    pass
'
    rm -f "$DATA_DIR/override.jpg"
    rm -f "$DATA_DIR/override.png"
    date +%s > "$DATA_DIR/version.txt"
    echo "Today's Toolbox Override has been cleared."
    exit 0
fi

if [ "$action" = "Upload New Override" ]; then
    if [ -z "$file" ]; then
        echo "Error: You must select a file to upload!"
        exit 1
    fi
    mime=$(file -b --mime-type "$file" 2>/dev/null)
    if [ "$mime" = "image/png" ] || [ "$mime" = "image/jpeg" ]; then
        rm -f "$DATA_DIR/override.jpg"
        rm -f "$DATA_DIR/override.png"
        
        target_name=""
        if [ "$mime" = "image/png" ]; then
            cp "$file" "$DATA_DIR/override.png"
            target_name="override.png"
        else
            cp "$file" "$DATA_DIR/override.jpg"
            target_name="override.jpg"
        fi
        
        TARGET_NAME="$target_name" DATA_DIR="$DATA_DIR" python3 - <<'PYEOF'
import json
import datetime
import sys
import os
data_dir = os.environ.get("DATA_DIR", "/data")
path = os.path.join(data_dir, "trackers.json")
try:
    with open(path, "r") as f:
        data = json.load(f)
    effective_now = datetime.datetime.now() + datetime.timedelta(hours=1)
    data["toolbox_override_date"] = effective_now.strftime("%Y-%m-%d")
    data["toolbox_override_file"] = os.environ.get("TARGET_NAME", "")
    with open(path, "w") as f:
        json.dump(data, f, indent=4)
except Exception as e:
    print("Error updating trackers.json:", e)
    sys.exit(1)
PYEOF
        date +%s > "$DATA_DIR/version.txt"
        echo "Toolbox Override activated! It will automatically expire at midnight."
        exit 0
    else
        echo "Error: Invalid file type. Please upload a JPG or PNG."
        exit 1
    fi
fi
