#!/usr/bin/env bash
# =============================================================================
# reset-admin-password.sh — Emergency Password Reset Utility for YardStik
# =============================================================================
# Usage:
#   ./scripts/reset-admin-password.sh <new_password>
# =============================================================================

set -euo pipefail

NEW_PASSWORD="${1:-}"
if [ -z "$NEW_PASSWORD" ]; then
    echo "Usage: $0 <new_password>"
    echo "Resets the administrator password in SQLite and config.json."
    exit 1
fi

if [ ${#NEW_PASSWORD} -lt 6 ]; then
    echo "❌ Error: Password must be at least 6 characters long."
    exit 1
fi

# 1. Check if running inside host with Docker container active
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^yardstik-control-panel$"; then
    echo "Executing password reset inside running Docker container 'yardstik-control-panel'..."
    docker exec -it yardstik-control-panel node scripts/reset-admin-password.js "$NEW_PASSWORD"
    exit 0
fi

# 2. Standalone fallback (local development or container shell)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$REPO_DIR/control-panel/scripts/reset-admin-password.js" ]; then
    echo "Executing password reset via local Node.js environment..."
    cd "$REPO_DIR/control-panel"
    node scripts/reset-admin-password.js "$NEW_PASSWORD"
    exit 0
fi

echo "❌ Error: Could not find active 'yardstik-control-panel' container or reset-admin-password.js script."
exit 1
