#!/bin/sh
while getopts r: flag
do
    case "${flag}" in
        r) recipe=${OPTARG};;
    esac
done
echo "Updating blend recipe to: $recipe"
sed -i "s/\"blend_recipe\": \"[^\"]*\"/\"blend_recipe\": \"$recipe\"/" /data/trackers.json
date +%s > /data/version.txt
echo "Successfully updated trackers.json and refreshed the kiosk."
