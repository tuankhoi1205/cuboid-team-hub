#!/usr/bin/env bash
set -euo pipefail
repository_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_dir"
git pull --ff-only
node self-host/web-release.mjs
if [[ $# -eq 1 ]]; then
  pm2 restart "$1" --update-env
else
  echo 'Web installed. Restart your existing PM2/systemd service to load it.'
  echo 'For PM2: bash self-host/update-vps.sh YOUR_EXISTING_APP_NAME'
fi
echo 'Check http://127.0.0.1:3210/api/health and compare buildId to self-host/web-release/build-manifest.json.'
