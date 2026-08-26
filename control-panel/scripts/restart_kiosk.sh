#!/bin/sh
echo "Restarting kiosk container via Docker Socket..."
python3 -c '
import socket
import sys
try:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect("/var/run/docker.sock")
    sock.sendall(b"POST /containers/yardstik-app/restart?t=5 HTTP/1.0\r\nHost: localhost\r\n\r\n")
    response = sock.recv(4096)
    sock.close()
    if b"HTTP/1" in response:
        print("Restart command sent successfully.")
    else:
        print("Error: " + str(response))
        sys.exit(1)
except Exception as e:
    print("Error connecting to Docker socket: " + str(e))
    sys.exit(1)
'

echo "Triggering browser live-reload..."
date +%s > /data/version.txt
echo "Kiosk TV successfully refreshed!"
