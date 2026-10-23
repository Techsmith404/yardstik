#!/bin/bash
set -euo pipefail
DATA_DIR="${DATA_DIR:-/data}"
file=""
action=""

while getopts "f:a:" flag; do
    case "${flag}" in
        f) file="${OPTARG}" ;;
        a) action="${OPTARG}" ;;
        *) ;;
    esac
done

if [ "$action" = "Clear Current Override" ]; then
    DATA_DIR="$DATA_DIR" python3 - <<'PYEOF'
import json, os, sys, tempfile

data_dir = os.environ.get("DATA_DIR", "/data")
path = os.path.join(data_dir, "trackers.json")
try:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["toolbox_override_date"] = ""
        data["toolbox_override_file"] = ""
        dir_name = os.path.dirname(path)
        with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
            json.dump(data, tf, indent=4)
            temp_name = tf.name
        os.replace(temp_name, path)
except Exception as e:
    print(f"Error clearing override in trackers.json: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
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

    # Path traversal protection: resolve canonical path and verify it exists and is a regular file
    if [ ! -f "$file" ]; then
        echo "Error: File does not exist or is not a regular file."
        exit 1
    fi

    resolved_file="$(realpath "$file" 2>/dev/null || true)"
    if [ -z "$resolved_file" ] || [ ! -f "$resolved_file" ]; then
        echo "Error: Could not resolve file path safely."
        exit 1
    fi

    mime="$(file -b --mime-type "$resolved_file" 2>/dev/null || true)"
    if [ "$mime" = "image/png" ] || [ "$mime" = "image/jpeg" ]; then
        rm -f "$DATA_DIR/override.jpg"
        rm -f "$DATA_DIR/override.png"

        target_name=""
        if [ "$mime" = "image/png" ]; then
            cp "$resolved_file" "$DATA_DIR/override.png"
            target_name="override.png"
        else
            cp "$resolved_file" "$DATA_DIR/override.jpg"
            target_name="override.jpg"
        fi

        TARGET_NAME="$target_name" DATA_DIR="$DATA_DIR" python3 - <<'PYEOF'
import json, datetime, sys, os, tempfile

data_dir = os.environ.get("DATA_DIR", "/data")
path = os.path.join(data_dir, "trackers.json")
try:
    data = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    effective_now = datetime.datetime.now() + datetime.timedelta(hours=1)
    data["toolbox_override_date"] = effective_now.strftime("%Y-%m-%d")
    data["toolbox_override_file"] = os.environ.get("TARGET_NAME", "")
    
    dir_name = os.path.dirname(path)
    with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
        json.dump(data, tf, indent=4)
        temp_name = tf.name
    os.replace(temp_name, path)
except Exception as e:
    print(f"Error updating trackers.json: {e}", file=sys.stderr)
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
