#!/bin/bash

echo "Scanning for new metrics and safety slides..."
ls ./html/assets/safety-slides | jq -R -s -c 'split("\n")[:-1]' > ./html/assets/data/safety.json
ls ./html/assets/metrics | jq -R -s -c 'split("\n")[:-1]' > ./html/assets/data/metrics.json
echo "Done! You can now run 'npx serve ./html'"
