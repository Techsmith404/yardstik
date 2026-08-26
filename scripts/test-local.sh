#!/bin/bash
set -euo pipefail

# Ensure we are in the project root directory
cd "$(dirname "$0")/.."

echo "========================================="
echo "🧪 Running Local Kiosk Test..."
echo "========================================="

# 1. Initialize ephemeral data directory and config if missing
echo "Checking /opt/kiosk-data structure..."
if [ ! -d /opt/kiosk-data/data ]; then
    echo "Creating /opt/kiosk-data/data..."
    sudo mkdir -p /opt/kiosk-data/data
fi

# If Docker previously auto-created config.json as a folder, remove it
if [ -d /opt/kiosk-data/config.json ]; then
    echo "Fixing /opt/kiosk-data/config.json (was created as directory by Docker)..."
    sudo rm -rf /opt/kiosk-data/config.json
fi

if [ -d /opt/kiosk-data/data/config.json ]; then
    sudo rm -rf /opt/kiosk-data/data/config.json
fi

if [ ! -f /opt/kiosk-data/config.json ]; then
    echo "Seeding /opt/kiosk-data/config.json from template..."
    if [ -f ./config.template.json ]; then
        sudo cp ./config.template.json /opt/kiosk-data/config.json
    else
        echo '{"site_name":"Local Test Kiosk","site_id":"local-test","latitude":41.6045,"longitude":-87.1311,"timezone":"America/Chicago","vercel_api_url":"","admin_username":"admin","admin_password_hash":"admin"}' | sudo tee /opt/kiosk-data/config.json > /dev/null
    fi
fi

# Seed sample data assets if empty
if [ -d ./html/assets/data ]; then
    sudo cp -rn ./html/assets/data/* /opt/kiosk-data/data/ 2>/dev/null || true
fi

# Seed sample safety slides if empty
if [ ! -d /opt/kiosk-data/safety-slides ]; then
    echo "Creating /opt/kiosk-data/safety-slides..."
    sudo mkdir -p /opt/kiosk-data/safety-slides
fi
if [ -d ./html/assets/safety-slides ]; then
    sudo cp -rn ./html/assets/safety-slides/* /opt/kiosk-data/safety-slides/ 2>/dev/null || true
fi

# Ensure frontend has clean config.json in /opt/kiosk-data/data/
sudo cp /opt/kiosk-data/config.json /opt/kiosk-data/data/config.json
sudo chmod -R 777 /opt/kiosk-data 2>/dev/null || true

# 2. Reset and build containers
echo "Bringing down any running containers..."
sudo docker compose down --remove-orphans 2>/dev/null || true

echo "Building and starting Kiosk and Control Panel containers..."
sudo docker compose up -d --build --remove-orphans

# 3. Wait for web services to become healthy
echo "Waiting for Kiosk web server to become healthy..."
while ! curl -s -f http://127.0.0.1:8080 > /dev/null 2>&1; do
    sleep 1
done

echo ""
echo "========================================================="
echo "✅ KIOSK STACK RUNNING ✅"
echo "---------------------------------------------------------"
echo "📺 Kiosk Dashboard:  http://localhost:8080"
echo "⚙️ Control Panel:    http://localhost:1337"
echo "📁 Data Directory:  /opt/kiosk-data/data"
echo "⚙️ Site Config:      /opt/kiosk-data/config.json"
echo "========================================================="
echo ""
echo "🔍 Checking Control Panel Logs..."
sleep 1
sudo docker logs yardstik-control-panel --tail 20
