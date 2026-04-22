#!/bin/bash

# Create log directory — world-writable (sticky) so rootless container users
mkdir -p ~/.logs/butler
chmod 1777 ~/.logs/butler

# Install the iptables port-forward service (443 → 8443) as a system unit.
# The service is idempotent and runs before podman on every boot.
# Skip if already enabled and the unit file is unchanged.
UNIT_SRC="quadlets/iptables-rules.service"
UNIT_DST="/etc/systemd/system/iptables-rules.service"
if ! diff -q "$UNIT_SRC" "$UNIT_DST" &>/dev/null; then
    echo "Installing iptables-rules.service..."
    sudo cp "$UNIT_SRC" "$UNIT_DST"
    sudo systemctl daemon-reload
    sudo systemctl enable --now iptables-rules.service
else
    echo "iptables-rules.service is up to date."
fi

# Remove old quadlets
rm -rf ~/.config/containers/systemd/server

# Stop the service
systemctl --user stop dashboard-pod.service
podman stop -a

# Copy only .container, .volume, .network files (not scripts/docs)
mkdir -p ~/.config/containers/systemd/server/
cp quadlets/*.container ~/.config/containers/systemd/server/ 2>/dev/null || true
cp quadlets/*.volume ~/.config/containers/systemd/server/ 2>/dev/null || true
cp quadlets/*.network ~/.config/containers/systemd/server/ 2>/dev/null || true
cp quadlets/*.pod ~/.config/containers/systemd/server/ 2>/dev/null || true

# Copy environment files
cp .env.secrets ~/.config/containers/systemd/server/.env.secrets 2>/dev/null || true
cp .env.variables ~/.config/containers/systemd/server/.env.variables 2>/dev/null || true

# Reload and start
systemctl --user daemon-reload
sleep 2
systemctl --user start dashboard-pod.service

# List podman containers
podman ps