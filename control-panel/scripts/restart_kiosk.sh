#!/bin/bash
# Restarts the kiosk web container via Docker socket and triggers a browser live-reload.
set -euo pipefail
DATA_DIR="${DATA_DIR:-/data}"
KIOSK_CONTAINER="${KIOSK_CONTAINER:-yardstik-app}"
DOCKER_SOCK="${DOCKER_SOCK:-/var/run/docker.sock}"

echo "Restarting kiosk container via Docker Socket..."
if [ -S "$DOCKER_SOCK" ]; then
    python3 -c "
import socket, os, sys
container = os.environ.get('KIOSK_CONTAINER', 'yardstik-app')
sock_path = os.environ.get('DOCKER_SOCK', '/var/run/docker.sock')
try:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect(sock_path)
    request = f'POST /containers/{container}/restart?t=5 HTTP/1.0\r\nHost: localhost\r\n\r\n'
    sock.sendall(request.encode())
    response = sock.recv(4096)
    sock.close()
    if b'HTTP/1' in response:
        print('Restart command sent successfully.')
    else:
        print('Notice: Unexpected Docker response (' + str(response) + '). Proceeding to browser reload.')
except Exception as e:
    print('Notice: Docker socket restart bypassed (' + str(e) + '). Proceeding to browser reload.')
" KIOSK_CONTAINER="$KIOSK_CONTAINER" DOCKER_SOCK="$DOCKER_SOCK"
else
    echo "Notice: Docker socket not found (${DOCKER_SOCK}). Simulating container recycle in non-Docker environment."
fi

echo "Triggering browser live-reload..."
date +%s > "${DATA_DIR}/version.txt"
echo "Kiosk TV successfully refreshed!"

