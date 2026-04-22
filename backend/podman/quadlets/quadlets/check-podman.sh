#!/bin/bash
clear
BLUE='\e[34m'
RESET='\e[0m'

echo -e "\n\n${BLUE}---------------- Check Podman Services ----------------${RESET}\n"
for svc in butler-nginx-server butler-api-server butler-loki-server butler-grafana-server butler-prometheus-server butler-node-exporter butler-alloy; do
    systemctl --user status "$svc.service" --no-pager -l
done

echo -e "\n\n${BLUE}---------------- Check Folders ----------------${RESET}\n"
ls -ld ~/ws/butler
ls -ld ~/.logs/butler
