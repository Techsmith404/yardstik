#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "========================================="
echo "🔒 INITIATING MAXIMUM KIOSK LOCKDOWN 🔒"
echo "========================================="

# 1. FIREWALL LOCKDOWN
echo "[1/4] Applying strict UFW firewall policies..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow in on lo
sudo ufw allow out on lo
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 1337 proto tcp
sudo ufw allow out 53/udp
sudo ufw allow out 53/tcp
sudo ufw allow out 80/tcp
sudo ufw allow out 443/tcp
sudo ufw allow out 123/udp
sudo ufw allow in 5353/udp
sudo ufw allow out 5353/udp
sudo ufw --force enable

# 2. NETWORK KERNEL HARDENING
echo "[2/4] Hardening Network Kernel Parameters (sysctl)..."
cat <<EOF | sudo tee /etc/sysctl.d/99-kiosk-lockdown.conf > /dev/null
# Defend against SYN Flood attacks
net.ipv4.tcp_syncookies = 1
# Ignore Ping/ICMP requests (stealth mode)
net.ipv4.icmp_echo_ignore_all = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
# Disable IP source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
EOF
sudo sysctl -p /etc/sysctl.d/99-kiosk-lockdown.conf

# 3. DISABLE PHYSICAL ATTACK VECTORS
echo "[3/4] Disabling USB Mass Storage (Thumb drives) & Bluetooth..."
# Prevent USB thumb drives from mounting (keyboards/mice still work)
echo "install usb-storage /bin/true" | sudo tee /etc/modprobe.d/disable-usb-storage.conf > /dev/null
sudo rmmod usb-storage 2>/dev/null || true
# Disable bluetooth
sudo systemctl disable --now bluetooth 2>/dev/null || true

# 4. SSH HARDENING
echo "[4/4] Hardening SSH Daemon..."
sudo sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config || true
sudo sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config || true
sudo systemctl restart ssh || sudo systemctl restart sshd || true

echo "========================================="
echo "✅ LOCKDOWN COMPLETE! The Kiosk is fully secured."
echo "========================================="
