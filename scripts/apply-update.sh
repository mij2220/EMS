#!/usr/bin/env bash
# ============================================================================
# EMS — Apply an update folder and deploy
#
# Whenever Claude gives you a new EMS_Complete_App.zip with changes: unzip it
# (anywhere, e.g. ~/Downloads/EMS_Complete_App), then run this pointing at
# that folder. It copies over only what actually changed, then runs the
# normal deploy script.
#
# Usage:
#   ./scripts/apply-update.sh ~/Downloads/EMS_Complete_App
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  echo "Usage: ./scripts/apply-update.sh /path/to/unzipped/EMS_Complete_App"
  exit 1
fi
SOURCE="${SOURCE%/}"
if [ ! -d "$SOURCE" ]; then
  echo "✗ Not a folder: $SOURCE"
  exit 1
fi

echo "== Syncing from: $SOURCE =="
echo "   (dry run first — nothing changes yet)"
echo ""
rsync -avn \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.local' \
  "$SOURCE"/ ./ | head -50

echo ""
read -p "Apply the above changes for real? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Cancelled — nothing was changed."
  exit 0
fi

rsync -av \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.env.local' \
  "$SOURCE"/ ./

chmod +x scripts/*.sh 2>/dev/null || true

echo ""
echo "== Files synced. Now deploying. =="
./scripts/deploy-railway.sh
