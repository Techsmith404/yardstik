#!/bin/bash
# =============================================================================
# site-install.sh — Kiosk Fresh Installation Script (One-and-Done)
# =============================================================================
# Run this on a fresh Ubuntu Server install to set up the kiosk from scratch.
# Requires an internet connection. Run as a normal user with sudo access.
#
# Usage:
#   chmod +x site-install.sh
#   ./site-install.sh
# =============================================================================

set -euo pipefail

# ── CONFIG ────────────────────────────────────────────────────────────────────
GITHUB_REPO="${GITHUB_REPO:-https://github.com/TechSmith404/ops-kiosk.git}"
BRANCH="${1:-main}"
INSTALL_DIR="$HOME/kiosk-app"
DATA_DIR="/opt/kiosk-data"
LOG_FILE="$HOME/kiosk-install.log"
# ─────────────────────────────────────────────────────────────────────────────

# Direct all stdout and stderr to both terminal and log file simultaneously
exec > >(tee -a "$LOG_FILE") 2>&1
echo "======================================================"
echo "  Kiosk Installation Started: $(date)"
echo "  Log file: $LOG_FILE"
echo "======================================================"

BOLD="\e[1m"
GREEN="\e[32m"
YELLOW="\e[33m"
CYAN="\e[36m"
RESET="\e[0m"

log()     { echo -e "${BOLD}${GREEN}[✓]${RESET} $1"; }
info()    { echo -e "${BOLD}${CYAN}[→]${RESET} $1"; }
warn()    { echo -e "${BOLD}${YELLOW}[!]${RESET} $1"; }
section() { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}"; echo -e "${BOLD}  $1${RESET}"; echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}"; }

if [ "$EUID" -eq 0 ]; then
    echo "Do NOT run as root. Run as a normal user with sudo access."
    exit 1
fi

section "Step 1 — System Update & Base Packages"
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y \
    curl wget git unzip zip \
    ca-certificates gnupg lsb-release \
    python3 python3-pip \
    snapd \
    avahi-daemon avahi-utils
sudo systemctl enable --now avahi-daemon
log "Base packages and mDNS (.local) discovery installed."

section "Step 2 — Install Docker Engine & Compose"
# Remove old docker installs if any
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key and repo
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run Docker without sudo
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker
log "Docker installed."

section "Step 3 — GitHub SSH Authentication"
warn "GitHub requires an SSH key for authenticated private repository access."
echo ""

SSH_KEY_PATH="$HOME/.ssh/id_ed25519_kiosk"
if [ ! -f "$SSH_KEY_PATH" ]; then
    ssh-keygen -t ed25519 -C "kiosk-$(hostname)" -f "$SSH_KEY_PATH" -N ""
    log "SSH key generated at $SSH_KEY_PATH"
else
    warn "SSH key already exists at $SSH_KEY_PATH — using existing key."
fi

# Configure SSH to use port 443 (HTTPS port) via ssh.github.com to bypass plant firewalls
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
cat > "$HOME/.ssh/config" <<EOF
Host github.com
    Hostname ssh.github.com
    Port 443
    User git
    IdentityFile $SSH_KEY_PATH
    StrictHostKeyChecking no
EOF
chmod 600 "$HOME/.ssh/config"

echo ""
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  ACTION REQUIRED: Add this public key to GitHub${RESET}"
echo -e "${BOLD}${YELLOW}══════════════════════════════════════════════════════${RESET}"
echo ""
cat "${SSH_KEY_PATH}.pub"
echo ""
echo -e "  1. Copy the key above"
echo -e "  2. Go to: ${BOLD}https://github.com/settings/keys${RESET}"
echo -e "  3. Click 'New SSH key', paste it, and save."
echo ""

# Loop until GitHub SSH authentication succeeds
while true; do
    read -rp "Press ENTER once you have added the key to GitHub..." _ < /dev/tty
    info "Verifying GitHub connection over port 443..."
    SSH_AUTH_OUTPUT=$(ssh -T git@github.com 2>&1 || true)
    if echo "$SSH_AUTH_OUTPUT" | grep -qi "successfully authenticated"; then
        log "GitHub SSH connection verified successfully!"
        break
    else
        warn "Could not authenticate with GitHub yet. Please ensure the key was saved."
        echo ""
    fi
done

section "Step 4 — Clone Kiosk Repository"
if [ -d "$INSTALL_DIR/.git" ]; then
    warn "$INSTALL_DIR already exists. Pulling latest code..."
    cd "$INSTALL_DIR"
    git pull origin "$BRANCH"
else
    # Convert HTTPS URL to SSH
    SSH_REPO=$(echo "$GITHUB_REPO" | sed 's|https://github.com/|git@github.com:|')
    git clone --branch "$BRANCH" "$SSH_REPO" "$INSTALL_DIR"
fi
log "Repository cloned to $INSTALL_DIR."

section "Step 5 — Setup Ephemeral Data Directory"
sudo mkdir -p "$DATA_DIR/data"
sudo chown -R "$USER:$USER" "$DATA_DIR"
sudo chmod -R 777 "$DATA_DIR"

# Seed default data templates if they don't exist
TEMPLATE_DATA="$INSTALL_DIR/html/assets/data"
for f in reminders.md metrics.json daily.json safety.json trackers.json \
          anniversaries.json shifts.json equipment.json; do
    if [ ! -f "$DATA_DIR/data/$f" ] && [ -f "$TEMPLATE_DATA/$f" ]; then
        cp "$TEMPLATE_DATA/$f" "$DATA_DIR/data/$f"
        log "Seeded $f from template."
    fi
done

if [ ! -f "$DATA_DIR/data/version.txt" ]; then
    date +%s > "$DATA_DIR/data/version.txt"
fi

if [ ! -f "$DATA_DIR/config.json" ]; then
    if [ -f "$INSTALL_DIR/config.template.json" ]; then
        cp "$INSTALL_DIR/config.template.json" "$DATA_DIR/config.json"
    elif [ -f "$INSTALL_DIR/site-config.template.json" ]; then
        cp "$INSTALL_DIR/site-config.template.json" "$DATA_DIR/config.json"
    fi
    warn "Site config created at $DATA_DIR/config.json"
fi
cp "$DATA_DIR/config.json" "$DATA_DIR/data/config.json" 2>/dev/null || true

# Seed sample safety slides if directory missing
sudo mkdir -p "$DATA_DIR/safety-slides"
if [ -d "$INSTALL_DIR/html/assets/safety-slides" ]; then
    cp -rn "$INSTALL_DIR/html/assets/safety-slides/"* "$DATA_DIR/safety-slides/" 2>/dev/null || true
fi

sudo chmod -R 777 "$DATA_DIR"
log "Ephemeral data and safety slides directory ready at $DATA_DIR"

section "Step 6 — Build & Start Docker Services"
cd "$INSTALL_DIR"
sg docker -c "docker compose up -d --build"

# Verify local container is responding
info "Waiting for Docker kiosk web server to become healthy..."
while ! curl -s -f http://127.0.0.1:8080 > /dev/null 2>&1; do
    sleep 1
done
log "Docker containers online and serving at http://localhost:8080!"

section "Step 7 — Install Snap Kiosk Display Server & Browser"
sudo snap install ubuntu-frame
sudo snap install wpe-webkit-mir-kiosk
sudo snap install mesa-core22

# Robust helper to execute snap configuration commands with automatic lock retries
snap_cmd_retry() {
    local max_attempts=15
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        # Wait for any in-flight snap background tasks to finish (word boundary prevents matching 'Done')
        while snap changes 2>/dev/null | grep -qE "\b(Doing|Do|Undoing|Undo)\b"; do
            sleep 1
        done

        if "$@" 2>/dev/null; then
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    warn "Snap command '$*' timed out (continuing)..."
    return 0
}

# Wire up snap interface connections with retries
snap_cmd_retry sudo snap connect ubuntu-frame:opengl
snap_cmd_retry sudo snap connect ubuntu-frame:network-bind
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:graphics-core22 mesa-core22:graphics-core22
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:opengl
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:network
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:network-bind
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:hardware-observe
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:audio-playback
snap_cmd_retry sudo snap connect wpe-webkit-mir-kiosk:wayland ubuntu-frame:wayland

# Point browser to local docker kiosk
snap_cmd_retry sudo snap set wpe-webkit-mir-kiosk url=http://localhost:8080

# Configure daemons & cursor
snap_cmd_retry sudo snap set ubuntu-frame daemon=true
snap_cmd_retry sudo snap set wpe-webkit-mir-kiosk daemon=true
snap_cmd_retry sudo snap set ubuntu-frame config="cursor=null"

# Freeze auto-updates to prevent unexpected Wayland breakages
snap_cmd_retry sudo snap refresh --hold ubuntu-frame
snap_cmd_retry sudo snap refresh --hold wpe-webkit-mir-kiosk

# Delay browser startup until nginx is up and inject timezone
HOST_TZ=$(cat /etc/timezone 2>/dev/null || echo "America/Chicago")
sudo mkdir -p /etc/systemd/system/snap.wpe-webkit-mir-kiosk.daemon.service.d
cat <<EOF | sudo tee /etc/systemd/system/snap.wpe-webkit-mir-kiosk.daemon.service.d/override.conf
[Service]
ExecStartPre=/bin/bash -c "while ! wget -q --spider http://127.0.0.1:8080; do sleep 1; done"
Environment="TZ=$HOST_TZ"
EOF
sudo systemctl daemon-reload
log "Ubuntu Frame & WPE Browser installed and wired."

section "Step 8 — Boot Optimizations, Silent Boot & Cron Jobs"
# Disable network wait services that cause boot delays
sudo systemctl disable systemd-networkd-wait-online.service 2>/dev/null || true
sudo systemctl mask systemd-networkd-wait-online.service 2>/dev/null || true
sudo systemctl disable NetworkManager-wait-online.service 2>/dev/null || true
sudo systemctl mask NetworkManager-wait-online.service 2>/dev/null || true

# Run Plymouth splash and silent boot configuration
if [ -f "$INSTALL_DIR/scripts/setup-boot-splash.sh" ]; then
    sudo "$INSTALL_DIR/scripts/setup-boot-splash.sh" || true
fi

# Set up crontab auto-sync (every 3 mins) and midnight tmp cleanup
CRON_CMD="*/3 * * * * $INSTALL_DIR/kiosk-sync.sh >> $INSTALL_DIR/sync.log 2>&1"
TMP_CRON="0 0 * * * find $HOME/tmp -mindepth 1 -delete 2>/dev/null || true"

CURRENT_CRON=$(crontab -l 2>/dev/null || true)
NEW_CRON=$(echo "$CURRENT_CRON" | grep -v "kiosk-sync.sh" | grep -v "tmp -mindepth" || true)

{
    if [ -n "$NEW_CRON" ]; then
        echo "$NEW_CRON"
    fi
    echo "$CRON_CMD"
    echo "$TMP_CRON"
} | crontab -

log "Boot optimizations and cron schedules installed."

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✅  Installation Complete!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Kiosk TV URL:    ${BOLD}http://localhost:8080${RESET} (or ${CYAN}http://$(hostname).local:8080${RESET})"
echo -e "  Control Panel:   ${BOLD}http://localhost:1337${RESET} (or ${CYAN}http://$(hostname).local:1337${RESET})"
echo -e "  Site Config:     ${BOLD}$DATA_DIR/config.json${RESET}"
echo -e "  Ephemeral Data:  ${BOLD}$DATA_DIR/data/${RESET}"
echo -e "  Sync Log:        ${BOLD}$INSTALL_DIR/sync.log${RESET}"
echo ""
warn "A REBOOT is recommended to apply all display and service changes."
echo ""
read -rp "Reboot now? [y/N] " answer < /dev/tty
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo reboot
fi
