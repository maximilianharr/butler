#!/usr/bin/env bash
# One-time server bootstrap. Run as root ON the server:
#   REMOTE_USER=... REMOTE_PW=... bash setup.sh
# Idempotent: safe to re-run.
set -euo pipefail

: "${REMOTE_USER:?set REMOTE_USER}" "${REMOTE_PW:?set REMOTE_PW}"

BRANCH=feature/ai-test-01
REPO=https://github.com/maximilianharr/butler.git
APP=/opt/butler/app
DATA=/opt/butler-data

apt-get update
apt-get install -y podman ufw git rsync

mkdir -p "$DATA"/{content,settings,caddy/data,caddy/config}

if [ -d "$APP/.git" ]; then
  git -C "$APP" pull
else
  git clone -b "$BRANCH" "$REPO" "$APP"
fi

podman build -t butler-app "$APP"

HASH=$(podman run --rm docker.io/library/caddy:2 caddy hash-password --plaintext "$REMOTE_PW")
sed -e "s|__USER__|$REMOTE_USER|" -e "s|__HASH__|$HASH|" \
  "$APP/deploy/Caddyfile.template" > "$DATA/caddy/Caddyfile"

cp "$APP"/deploy/butler.network "$APP"/deploy/butler-app.container \
   "$APP"/deploy/butler-caddy.container /etc/containers/systemd/
systemctl daemon-reload
systemctl restart butler-app butler-caddy

ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
# containers need to reach aardvark-dns on the bridge; deny-incoming blocks it otherwise
ufw allow in on podman1 comment "podman internal (aardvark-dns etc.)"
# published container ports (80/443) arrive via the FORWARD chain, which ufw drops by default
ufw route allow out on podman1 comment "published container ports"
ufw --force enable

echo "done. check: systemctl status butler-app butler-caddy"
