#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "========================================="
echo "📦 Packaging Kiosk Deployment Payload..."
echo "========================================="

# 1. Rebuild the docker image locally
echo "[1/3] Building docker image: kiosk-webserver:latest..."
sudo docker build -t kiosk-webserver:latest .

# 2. Save the docker image to a tar file for offline transport
echo "[2/3] Exporting docker image to kiosk-webserver.tar..."
sudo docker save kiosk-webserver:latest > kiosk-webserver.tar

# 3. Create the deployment zip file
echo "[3/3] Creating deployment archive (../kiosk-deployment.zip)..."
rm -f ../kiosk-deployment.zip
zip -r ../kiosk-deployment.zip \
  docker-compose.yml \
  kiosk-webserver.tar \
  employee_list.xlsx \
  scripts/ \
  html/ \
  control-panel/ \
  nginx.conf

echo "[cleanup] Removing temporary tar archive..."
rm kiosk-webserver.tar

echo "========================================="
echo "✅ Done! Send 'kiosk-deployment.zip' to the kiosk PC."
echo "On the kiosk, drop it in a temporary folder (like ~/tmp), unzip it, and run:"
echo "  ./scripts/deploy.sh"
echo "========================================="
