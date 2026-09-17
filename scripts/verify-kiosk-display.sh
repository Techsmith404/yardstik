#!/usr/bin/env bash
# ==============================================================================
# 🖥️ YardStik Kiosk Display Verification & Diagnostic Engine
# Validates Wayland display environment, Ubuntu Frame snap compositor,
# and Chromium/WPE browser launch flags to guarantee zero unattended breakages.
#
# Usage:
#   ./scripts/verify-kiosk-display.sh                      # Host inspection mode
#   ./scripts/verify-kiosk-display.sh --audit-service <file> # Service audit mode
# ==============================================================================
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
log_fail() { echo -e "  ${RED}✗${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

audit_service_file() {
    local service_path="$1"
    local errors=0

    echo -e "${BOLD}${CYAN}Auditing Kiosk Display Service: ${service_path}${NC}"

    if [ ! -f "$service_path" ]; then
        log_fail "Service file does not exist: $service_path"
        return 1
    fi

    local content
    content=$(cat "$service_path")

    # 1. Wayland display socket checks
    if echo "$content" | grep -qE "WAYLAND_DISPLAY="; then
        local w_val
        w_val=$(echo "$content" | grep -oE "WAYLAND_DISPLAY=[^ ]+" | head -1)
        log_pass "Wayland socket specified: ${w_val}"
    else
        log_fail "Missing WAYLAND_DISPLAY environment variable (required for Wayland/Ubuntu Frame)."
        errors=$((errors + 1))
    fi

    if echo "$content" | grep -qE "XDG_RUNTIME_DIR="; then
        local x_val
        x_val=$(echo "$content" | grep -oE "XDG_RUNTIME_DIR=[^ ]+" | head -1)
        log_pass "Runtime directory specified: ${x_val}"
    else
        log_fail "Missing XDG_RUNTIME_DIR environment variable."
        errors=$((errors + 1))
    fi

    # 2. Critical Chromium anti-crash flags for unattended industrial TV display
    local required_flags=(
        "--ozone-platform=wayland"
        "--kiosk"
        "--incognito"
        "--noerrdialogs"
        "--disable-session-crashed-bubble"
        "--disable-infobars"
        "--no-sandbox"
    )

    for flag in "${required_flags[@]}"; do
        if echo "$content" | grep -Fq -- "$flag"; then
            log_pass "Required flag present: $flag"
        else
            log_fail "Missing critical browser flag: $flag (essential to prevent crash bubbles & restore dialogs)."
            errors=$((errors + 1))
        fi
    done

    # 3. Kiosk URL destination
    if echo "$content" | grep -qE "http://(localhost|127\.0\.0\.1):8080"; then
        log_pass "Browser targets local Kiosk TV Nginx port 8080"
    else
        log_fail "Missing or invalid target URL (must target http://localhost:8080 or http://127.0.0.1:8080)."
        errors=$((errors + 1))
    fi

    # 4. Process recovery and restart policies
    if echo "$content" | grep -qE "Restart=(always|on-failure)"; then
        log_pass "Systemd auto-restart policy configured"
    else
        log_fail "Missing Restart=always in service definition (kiosk won't recover if browser closes)."
        errors=$((errors + 1))
    fi

    # 5. Ubuntu Frame dependency
    if echo "$content" | grep -qE "ubuntu-frame"; then
        log_pass "Dependency on Ubuntu Frame compositor configured"
    else
        log_warn "No explicit dependency on snap.ubuntu-frame.daemon.service found."
    fi

    echo ""
    if [ "$errors" -eq 0 ]; then
        echo -e "${BOLD}${GREEN}All display service audit checks PASSED.${NC}"
        return 0
    else
        echo -e "${BOLD}${RED}Service audit failed with ${errors} error(s).${NC}"
        return 1
    fi
}

check_live_host() {
    local warnings=0
    local errors=0

    echo -e "${BOLD}${CYAN}Checking Live Kiosk Host Display Environment...${NC}"

    # 1. Snap daemon availability
    if command -v snap >/dev/null 2>&1; then
        log_pass "Snap package manager installed"

        # Check Ubuntu Frame
        if snap list ubuntu-frame >/dev/null 2>&1; then
            log_pass "Ubuntu Frame snap installed"
            
            # Check daemon status
            local frame_daemon
            frame_daemon=$(snap get ubuntu-frame daemon 2>/dev/null || echo "false")
            if [ "$frame_daemon" = "true" ]; then
                log_pass "Ubuntu Frame daemon is enabled (daemon=true)"
            else
                log_warn "Ubuntu Frame daemon is NOT set to true (snap get ubuntu-frame daemon returned '${frame_daemon}')"
                warnings=$((warnings + 1))
            fi
        else
            log_warn "Ubuntu Frame snap not installed on this host (normal in non-kiosk development environment)."
            warnings=$((warnings + 1))
        fi

        # Check Chromium or WPE
        if snap list chromium >/dev/null 2>&1; then
            log_pass "Chromium snap installed"
        elif snap list wpe-webkit-mir-kiosk >/dev/null 2>&1; then
            log_pass "WPE WebKit Mir Kiosk snap installed"
        else
            log_warn "Neither Chromium nor WPE WebKit snap installed on this host (normal on dev machine)."
            warnings=$((warnings + 1))
        fi
    else
        log_info "Snap not detected on host (skipped live snap checks)."
    fi

    # 2. Local Kiosk Web Server probe
    if command -v wget >/dev/null 2>&1; then
        if wget -q --spider --timeout=2 http://127.0.0.1:8080 2>/dev/null; then
            log_pass "Local Kiosk TV webserver responding on http://127.0.0.1:8080"
        else
            log_info "Local Kiosk TV webserver not responding on port 8080 (containers may not be running locally)."
        fi
    fi

    # 3. Canonical service file verification
    local default_service="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/kiosk-browser.service"
    if [ -f "$default_service" ]; then
        audit_service_file "$default_service"
    else
        log_fail "Canonical service file not found at: $default_service"
        errors=$((errors + 1))
    fi

    return "$errors"
}

# Entrypoint routing
if [ "${1:-}" = "--audit-service" ]; then
    if [ -z "${2:-}" ]; then
        echo "Error: --audit-service requires a service file path."
        exit 1
    fi
    audit_service_file "$2"
    exit $?
elif [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 [--audit-service <path/to/kiosk-browser.service>]"
    exit 0
else
    check_live_host
    exit $?
fi
