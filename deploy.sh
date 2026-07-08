#!/usr/bin/env bash
# Redeploy butler: push local branch, rebuild image on server, restart app.
set -euo pipefail

HOST=root@87.106.141.72
BRANCH=$(git rev-parse --abbrev-ref HEAD)

git push origin "$BRANCH"
ssh "$HOST" "set -e
  git -C /opt/butler/app pull
  podman build -t butler-app /opt/butler/app
  cp /opt/butler/app/deploy/butler.network /opt/butler/app/deploy/butler-*.container /etc/containers/systemd/
  systemctl daemon-reload
  systemctl restart butler-app
"
echo "deployed. https://bit8.eu/butler/"
