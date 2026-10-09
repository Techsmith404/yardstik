#!/bin/bash
# Requires /var/run/docker.sock to be mounted (see docker-compose.yml)
set -euo pipefail

DOCKER_SOCK="${DOCKER_SOCK:-/var/run/docker.sock}"

if [ ! -S "$DOCKER_SOCK" ]; then
    echo "Notice: Docker socket ($DOCKER_SOCK) not accessible. System reboot intercepted and simulated."
    exit 0
fi

# Cleanup temp file on exit regardless of success or failure
REBOOT_TMP="/tmp/reboot_$(date +%s).json"
trap 'rm -f "$REBOOT_TMP"' EXIT

echo "Spinning up a privileged container to send reboot command..."
JOB_NAME="system-reboot-$(date +%s)"
curl -s -X POST --unix-socket "$DOCKER_SOCK" "http://localhost/images/create?fromImage=alpine:latest" > /dev/null
curl -s -X POST --unix-socket "$DOCKER_SOCK" \
    -H "Content-Type: application/json" \
    -d '{"Image":"alpine:latest","Cmd":["nsenter","-t","1","-m","-u","-n","-i","reboot"],"HostConfig":{"Privileged":true,"PidMode":"host"}}' \
    "http://localhost/containers/create?name=${JOB_NAME}" > "$REBOOT_TMP"
CONTAINER_ID=$(grep -o '"Id":"[^"]*' "$REBOOT_TMP" 2>/dev/null | cut -d'"' -f4)
if [ -n "$CONTAINER_ID" ]; then
    curl -s -X POST --unix-socket /var/run/docker.sock "http://localhost/containers/${CONTAINER_ID}/start"
    echo "Reboot command sent. Connection will be lost shortly."
    sleep 2
    curl -s -X DELETE --unix-socket /var/run/docker.sock "http://localhost/containers/${CONTAINER_ID}?v=true&force=true" > /dev/null 2>&1 || true
else
    echo "Error: Failed to create reboot container."
    exit 1
fi
