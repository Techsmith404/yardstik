#!/bin/bash
set -euo pipefail

echo "Scanning for new metrics and safety slides..."
mkdir -p ./html/assets/safety-slides ./html/assets/metrics ./html/assets/data

(ls -1 ./html/assets/safety-slides 2>/dev/null || true) | jq -R -s -c 'split("\n") | map(select(length > 0))' > ./html/assets/data/safety.json
(ls -1 ./html/assets/metrics 2>/dev/null || true) | jq -R -s -c 'split("\n") | map(select(length > 0))' > ./html/assets/data/metrics.json
echo "Done! You can now run 'npx serve ./html'"

