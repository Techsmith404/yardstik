#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "========================================="
echo "🔒 INITIATING MAXIMUM KIOSK LOCKDOWN 🔒"
echo "========================================="

# Detect or accept LAN subnet override
detect_lan_subnet() {
    local iface
    iface=$(ip route show default 2>/dev/null | awk '{print $5}' | head -n1)
    if [ -n "$iface" ]; then
        local cidr
        cidr=$(ip -o -f inet addr show dev "$iface" 2>/dev/null | awk '{print $4}' | head -n1)
        if [ -n "$cidr" ]; then
            local net
            net=$(python3 -c "import ipaddress; print(ipaddress.ip_network('$cidr', strict=False))" 2>/dev/null || true)
            if [ -n "$net" ]; then
                echo "$net"
                return 0
            fi
        fi
    fi
    echo "192.168.1.0/24"
}

LAN_SUBNET="${LAN_SUBNET:-$(detect_lan_subnet)}"

# 1. FIREWALL LOCKDOWN
echo "[1/4] Applying strict UFW firewall policies for LAN subnet ($LAN_SUBNET)..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow in on lo
sudo ufw allow out on lo
sudo ufw allow from "$LAN_SUBNET" to any port 22 proto tcp
sudo ufw allow from "$LAN_SUBNET" to any port 1337 proto tcp
sudo ufw allow out 53/udp
sudo ufw allow out 53/tcp
sudo ufw allow out 80/tcp
sudo ufw allow out 443/tcp
sudo ufw allow out 123/udp
# mDNS inbound restricted to LAN subnet — mDNS is link-local and should never arrive from the internet
sudo ufw allow in from 192.168.0.0/16 to any port 5353 proto udp
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
if [ -d "/etc/ssh/sshd_config.d" ]; then
    echo "PermitRootLogin no" | sudo tee /etc/ssh/sshd_config.d/99-kiosk-lockdown.conf > /dev/null
else
    if grep -q '^#*PermitRootLogin' /etc/ssh/sshd_config 2>/dev/null; then
        sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
    else
        echo "PermitRootLogin no" | sudo tee -a /etc/ssh/sshd_config > /dev/null
    fi
fi
sudo systemctl restart ssh 2>/dev/null || sudo systemctl restart sshd 2>/dev/null || true

echo "========================================="
echo "✅ LOCKDOWN COMPLETE! The Kiosk is fully secured."
echo "========================================="
