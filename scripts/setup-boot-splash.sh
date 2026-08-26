#!/bin/bash
# =============================================================================
# setup-boot-splash.sh — Kiosk Silent Boot & Plymouth Splash Screen Setup
# =============================================================================
# Silences all Linux kernel and systemd console messages during boot, replacing
# the scrolling "wall of text" with a clean Plymouth dark splash screen and spinner.
#
# Usage:
#   sudo ./scripts/setup-boot-splash.sh
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

log() { echo -e "${GREEN}==>${RESET} ${BOLD}$1${RESET}"; }
warn() { echo -e "${YELLOW}==>${RESET} $1"; }
err() { echo -e "${RED}==>${RESET} $1" >&2; exit 1; }

if [ "$EUID" -ne 0 ]; then
    err "This script must be run as root. Please use 'sudo ./scripts/setup-boot-splash.sh'"
fi

log "Installing Plymouth splash theme packages..."
apt-get update -qq
apt-get install -y -qq plymouth plymouth-themes plymouth-label

log "Configuring Plymouth theme to spinner..."
plymouth-set-default-theme -R spinner || plymouth-set-default-theme -R bgrt || true

log "Configuring GRUB for silent boot..."
if [ -f /etc/default/grub ]; then
    # Backup original GRUB config
    cp /etc/default/grub /etc/default/grub.bak.$(date +%s)

    # Set quiet splash and silence kernel/systemd console logs
    sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT=.*/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash loglevel=3 rd.systemd.show_status=auto rd.udev.log_level=3 vt.global_cursor_default=0 systemd.show_status=0"/' /etc/default/grub
    sed -i 's/^GRUB_TIMEOUT=.*/GRUB_TIMEOUT=1/' /etc/default/grub
    sed -i 's/^GRUB_TIMEOUT_STYLE=.*/GRUB_TIMEOUT_STYLE=hidden/' /etc/default/grub
    
    # Hide GRUB menu completely unless Shift/Esc is pressed
    if ! grep -q "GRUB_RECORDFAIL_TIMEOUT" /etc/default/grub; then
        echo "GRUB_RECORDFAIL_TIMEOUT=0" >> /etc/default/grub
    fi

    log "Updating GRUB bootloader..."
    update-grub 2>/dev/null || grub-mkconfig -o /boot/grub/grub.cfg 2>/dev/null || true
fi

log "Updating Initial RAM File System (initramfs)..."
update-initramfs -u

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✅  Silent Boot & Plymouth Splash Screen Installed!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "On next reboot, console code text will be hidden and replaced with a clean boot splash."
echo ""
