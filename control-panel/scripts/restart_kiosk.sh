#!/bin/sh
echo "Restarting kiosk and control panel containers via Docker Socket..."
python3 -c '
import socket
import sys
for container in ["yardstik-app", "yardstik-control-panel"]:
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect("/var/run/docker.sock")
        sock.sendall(f"POST /containers/{container}/restart?t=2 HTTP/1.0\r\nHost: localhost\r\n\r\n".encode())
        response = sock.recv(4096)
        sock.close()
        if b"HTTP/1" in response:
            print(f"Restart command for {container} sent successfully.")
        else:
            print(f"Error restarting {container}: {response}")
    except Exception as e:
        print(f"Error connecting to Docker socket for {container}: {e}")
'

echo "Triggering browser live-reload..."
date +%s > /data/version.txt 2>/dev/null || true
echo "Kiosk stack successfully refreshed!"
