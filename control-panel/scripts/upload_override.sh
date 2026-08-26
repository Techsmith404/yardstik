#!/bin/sh
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
    python3 -c '
import json
try:
    with open("/data/trackers.json", "r") as f:
        data = json.load(f)
    data["toolbox_override_date"] = ""
    with open("/data/trackers.json", "w") as f:
        json.dump(data, f, indent=4)
except Exception as e:
    pass
'
    rm -f /data/override.jpg
    rm -f /data/override.png
    date +%s > /data/version.txt
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
        rm -f /data/override.jpg
        rm -f /data/override.png
        
        target_name=""
        if [ "$mime" = "image/png" ]; then
            cp "$file" /data/override.png
            target_name="override.png"
        else
            cp "$file" /data/override.jpg
            target_name="override.jpg"
        fi
        
        python3 -c '
import json
import datetime
import sys
try:
    with open("/data/trackers.json", "r") as f:
        data = json.load(f)
    effective_now = datetime.datetime.now() + datetime.timedelta(hours=1)
    data["toolbox_override_date"] = effective_now.strftime("%Y-%m-%d")
    data["toolbox_override_file"] = "'$target_name'"
    with open("/data/trackers.json", "w") as f:
        json.dump(data, f, indent=4)
except Exception as e:
    print("Error updating trackers.json:", e)
    sys.exit(1)
'
        date +%s > /data/version.txt
        echo "Toolbox Override activated! It will automatically expire at midnight."
        exit 0
    else
        echo "Error: Invalid file type. Please upload a JPG or PNG."
        exit 1
    fi
fi
