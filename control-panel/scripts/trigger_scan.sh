#!/bin/bash
echo "Triggering manual asset scan via Docker Socket..."
curl -s -X POST --unix-socket /var/run/docker.sock -H "Content-Type: application/json" -d '{"AttachStdin":false,"AttachStdout":true,"AttachStderr":true,"Cmd":["python3","/app/parse_anniversaries.py"]}' "http://localhost/containers/yardstik-app/exec" > /tmp/exec.json
EXEC_ID=$(grep -o '"Id":"[^"]*' /tmp/exec.json | cut -d'"' -f4)
curl -s -X POST --unix-socket /var/run/docker.sock -H "Content-Type: application/json" -d '{"Detach":false,"Tty":false}' "http://localhost/containers/yardstik-app/exec/${EXEC_ID}/start"
date +%s > /data/version.txt
echo "Scan completed. Kiosk web page is automatically refreshing..."
