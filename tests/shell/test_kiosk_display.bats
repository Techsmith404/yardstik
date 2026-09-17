#!/usr/bin/env bats
# ==============================================================================
# 🖥️ YardStik Kiosk Display & Wayland/Snap Infrastructure Test Suite
# Verifies systemd service definitions, Wayland display sockets, Chromium/WPE
# anti-crash launch flags, and power-loss recovery resilience.
# ==============================================================================

setup() {
    export REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
    export SERVICE_FILE="$REPO_ROOT/scripts/kiosk-browser.service"
    export VERIFY_SCRIPT="$REPO_ROOT/scripts/verify-kiosk-display.sh"
    export SITE_INSTALL="$REPO_ROOT/site-install.sh"
    export TEST_TMP_DIR="$(mktemp -d /tmp/yardstik-display-test-XXXXXX)"
}

teardown() {
    if [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

@test "kiosk-browser.service: Canonical service file exists and has valid systemd structure" {
    [ -f "$SERVICE_FILE" ]

    # Must contain standard systemd sections
    run grep -E "^\[Unit\]" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    run grep -E "^\[Service\]" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    run grep -E "^\[Install\]" "$SERVICE_FILE"
    [ "$status" -eq 0 ]
}

@test "kiosk-browser.service: Configures Wayland display socket and runtime environment" {
    run grep "WAYLAND_DISPLAY=wayland-0" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    run grep "XDG_RUNTIME_DIR=/run/user/0" "$SERVICE_FILE"
    [ "$status" -eq 0 ]
}

@test "kiosk-browser.service: Requires Ubuntu Frame Wayland compositor dependency" {
    run grep "snap.ubuntu-frame.daemon.service" "$SERVICE_FILE"
    [ "$status" -eq 0 ]
    [[ "$output" =~ "snap.ubuntu-frame.daemon.service" ]]
}

@test "kiosk-browser.service: Enforces all 7 mandatory Chromium anti-crash and kiosk flags" {
    # 1. Ozone Wayland rendering
    run grep -- "--ozone-platform=wayland" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # 2. Fullscreen borderless kiosk mode
    run grep -- "--kiosk" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # 3. Incognito (prevents session caching across power cuts)
    run grep -- "--incognito" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # 4. Suppress error dialogs
    run grep -- "--noerrdialogs" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # 5. Suppress crashed session restore bubbles
    run grep -- "--disable-session-crashed-bubble" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # 6. Disable management and translation infobars
    run grep -- "--disable-infobars" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # 7. No-sandbox for daemon/root execution
    run grep -- "--no-sandbox" "$SERVICE_FILE"
    [ "$status" -eq 0 ]
}

@test "kiosk-browser.service: Configures auto-recovery restart policy and local port 8080 target" {
    run grep "Restart=always" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    run grep "RestartSec=5" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    run grep "http://localhost:8080" "$SERVICE_FILE"
    [ "$status" -eq 0 ]

    # Verifies webserver readiness probe before browser launch
    run grep -E "ExecStartPre=.*wget -q --spider http://127.0.0.1:8080" "$SERVICE_FILE"
    [ "$status" -eq 0 ]
}

@test "verify-kiosk-display.sh: Successfully audits canonical kiosk-browser.service" {
    run "$VERIFY_SCRIPT" --audit-service "$SERVICE_FILE"
    [ "$status" -eq 0 ]
    [[ "$output" =~ "All display service audit checks PASSED" ]]
}

@test "verify-kiosk-display.sh: Detects and rejects missing --ozone-platform=wayland flag" {
    local broken_service="$TEST_TMP_DIR/broken-service.service"
    # Remove --ozone-platform=wayland
    grep -v -- "--ozone-platform=wayland" "$SERVICE_FILE" > "$broken_service"

    run "$VERIFY_SCRIPT" --audit-service "$broken_service"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Missing critical browser flag: --ozone-platform=wayland" ]]
}

@test "verify-kiosk-display.sh: Detects and rejects missing --disable-session-crashed-bubble flag" {
    local broken_service="$TEST_TMP_DIR/broken-service.service"
    # Remove --disable-session-crashed-bubble
    grep -v -- "--disable-session-crashed-bubble" "$SERVICE_FILE" > "$broken_service"

    run "$VERIFY_SCRIPT" --audit-service "$broken_service"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Missing critical browser flag: --disable-session-crashed-bubble" ]]
}

@test "verify-kiosk-display.sh: Detects and rejects missing WAYLAND_DISPLAY socket" {
    local broken_service="$TEST_TMP_DIR/broken-service.service"
    # Remove WAYLAND_DISPLAY
    grep -v "WAYLAND_DISPLAY=" "$SERVICE_FILE" > "$broken_service"

    run "$VERIFY_SCRIPT" --audit-service "$broken_service"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Missing WAYLAND_DISPLAY environment variable" ]]
}

@test "site-install.sh: Retains Ubuntu Frame snap configuration, cursor hiding, and refresh hold" {
    [ -f "$SITE_INSTALL" ]

    # Ubuntu frame & WPE snap installation
    run grep "snap install ubuntu-frame" "$SITE_INSTALL"
    [ "$status" -eq 0 ]

    # Cursor hiding for TV aesthetic
    run grep "cursor=null" "$SITE_INSTALL"
    [ "$status" -eq 0 ]

    # Port 8080 binding
    run grep "url=http://localhost:8080" "$SITE_INSTALL"
    [ "$status" -eq 0 ]

    # Wayland interface connection
    run grep "wpe-webkit-mir-kiosk:wayland ubuntu-frame:wayland" "$SITE_INSTALL"
    [ "$status" -eq 0 ]

    # Auto-refresh held to prevent unannounced Wayland breakages
    run grep "snap refresh --hold ubuntu-frame" "$SITE_INSTALL"
    [ "$status" -eq 0 ]
}
