#!/bin/bash
echo "Spinning up a privileged container to send reboot command..."
curl -s -X POST --unix-socket /var/run/docker.sock "http://localhost/images/create?fromImage=alpine:latest" > /dev/null
curl -s -X POST --unix-socket /var/run/docker.sock -H "Content-Type: application/json" -d '{"Image":"alpine:latest","Cmd":["nsenter","-t","1","-m","-u","-n","-i","reboot"],"HostConfig":{"Privileged":true,"PidMode":"host"}}' "http://localhost/containers/create?name=system-reboot-job" > /tmp/reboot.json
CONTAINER_ID=$(cat /tmp/reboot.json | grep -o '"Id":"[^"]*' | cut -d'"' -f4)
curl -s -X POST --unix-socket /var/run/docker.sock "http://localhost/containers/$CONTAINER_ID/start"
echo "Reboot command sent. Connection will be lost shortly."
sleep 2
curl -s -X DELETE --unix-socket /var/run/docker.sock "http://localhost/containers/$CONTAINER_ID?v=true&force=true"
