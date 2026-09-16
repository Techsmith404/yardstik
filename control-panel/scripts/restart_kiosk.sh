#!/bin/bash
# Restarts the kiosk web container via Docker socket and triggers a browser live-reload.
set -euo pipefail
DATA_DIR="${DATA_DIR:-/data}"
KIOSK_CONTAINER="${KIOSK_CONTAINER:-yardstik-app}"

echo "Restarting kiosk container via Docker Socket..."
python3 -c "
import socket, os, sys
container = os.environ.get('KIOSK_CONTAINER', 'yardstik-app')
try:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect('/var/run/docker.sock')
    request = f'POST /containers/{container}/restart?t=5 HTTP/1.0\r\nHost: localhost\r\n\r\n'
    sock.sendall(request.encode())
    response = sock.recv(4096)
    sock.close()
    if b'HTTP/1' in response:
        print('Restart command sent successfully.')
    else:
        print('Error: Unexpected response: ' + str(response), file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print('Error connecting to Docker socket: ' + str(e), file=sys.stderr)
    sys.exit(1)
" KIOSK_CONTAINER="$KIOSK_CONTAINER"

echo "Triggering browser live-reload..."
date +%s > "${DATA_DIR}/version.txt"
echo "Kiosk TV successfully refreshed!"

