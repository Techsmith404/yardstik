# Break Room Kiosk Deployment Guide (Ubuntu Frame + Chromium Wayland)

This guide details how to configure a fully automated kiosk on **Ubuntu Server** that boots directly into the Wayland-based display server (**Ubuntu Frame**) and launches **Chromium** in kiosk mode to display the local dashboard.

---

## 🏗️ Architecture Overview

On system boot:
1. **Docker Daemon** starts, launching the `ops-kiosk-app` container automatically (`restart: always`).
2. **Ubuntu Frame** snap launches as a Wayland compositor directly on the connected screen (running as a system daemon, no desktop environment required).
3. A custom **Systemd Service** triggers after Ubuntu Frame is ready, launching **Chromium** in fullscreen kiosk mode on Wayland.

---

## 🛠️ Step 1: Install Snaps & Docker

SSH into your Ubuntu Server and run:

```bash
# Update APT repository
sudo apt update

# Install Docker & Docker Compose V2
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# Install Ubuntu Frame (Wayland compositor)
sudo snap install ubuntu-frame
sudo snap set ubuntu-frame daemon=true

# Install Chromium
sudo snap install chromium
```
> [!NOTE]
> Log out of SSH and log back in for the `docker` group permissions to take effect.

---

## 📂 Step 2: Prepare & Launch the Web Server

1. Copy the `kiosk` directory to your home folder on the server (e.g., `/home/codaine/kiosk`).
2. Ensure that `employee_list.xlsx` and `html/assets/data/incident_date.txt` are created as **files** (not directories) on the host.
3. Start the container:
   ```bash
   docker compose up --build -d
   ```

---

## ⚙️ Step 3: Configure Kiosk Autostart (Systemd Service)

To automatically launch Chromium inside the Ubuntu Frame display session on boot, create a custom systemd service.

1. Create the service file:
   ```bash
   sudo nano /etc/systemd/system/kiosk-browser.service
   ```

2. Add the following service definition:
   ```ini
   [Unit]
   Description=Fullscreen Kiosk Browser
   After=snap.ubuntu-frame.daemon.service docker.service
   Requires=snap.ubuntu-frame.daemon.service

   [Service]
   Type=simple
   User=root
   # Point to the Wayland display socket created by Ubuntu Frame
   Environment=WAYLAND_DISPLAY=wayland-0
   Environment=XDG_RUNTIME_DIR=/run/user/0
   
   # Run Chromium in incognito/kiosk mode on Wayland (bypasses power-cut prompts)
   ExecStart=/usr/bin/snap run chromium \
       --kiosk \
       --ozone-platform=wayland \
       --no-sandbox \
       --incognito \
       --noerrdialogs \
       --disable-infobars \
       --disable-session-crashed-bubble \
       --disable-features=TranslateUI \
       http://localhost:8080

   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start the kiosk browser service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable kiosk-browser.service
   sudo systemctl start kiosk-browser.service
   ```

---

## 🔋 Step 4: Robust Handling of Power Cuts

In industrial settings like a scrap yard, screens and kiosk PCs are frequently shut down by cutting the mains power rather than a clean OS shutdown.

To prevent Chromium from showing **"Restore pages?"** or **"Chromium didn't shut down correctly"** error bubbles on subsequent boots:
* The `--incognito` flag prevents browser state caching.
* The `--noerrdialogs` and `--disable-session-crashed-bubble` flags suppress all recovery prompts.
* `Restart=always` in the systemd service ensures that if Chromium crashes or closes, it will automatically relaunch in 5 seconds.

---

## 🔒 Security & Local Network Access

If you need to access the dashboard from other computers in the mill office:
```bash
sudo ufw allow 8080/tcp
```
The dashboard is accessible on the local network at `http://<ubuntu-server-ip>:8080`.
