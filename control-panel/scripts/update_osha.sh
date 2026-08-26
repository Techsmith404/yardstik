#!/bin/sh
while getopts d: flag
do
    case "${flag}" in
        d) date=${OPTARG};;
    esac
done
echo "Updating OSHA Safe Date to: $date"
sed -i "s/\"last_incident_date\": \"[^\"]*\"/\"last_incident_date\": \"$date\"/" /data/trackers.json
date +%s > /data/version.txt
echo "Successfully updated trackers.json and refreshed the kiosk."
