#!/usr/bin/env bash
# ============================================================================
# EMS — Apply local changes
#
# Run this after pulling/copying in new code (not for first-time setup —
# use setup-local.sh for that). This does NOT touch your database or wipe
# any data; it only installs dependencies and rebuilds.
#
# Usage:
#   ./scripts/deploy-local.sh          # install deps, rebuild, start dev server
#   ./scripts/deploy-local.sh --prod   # test a production build instead (npm run build && npm run start)
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PROD=false
for arg in "$@"; do
  case $arg in
    --prod) PROD=true ;;
  esac
done

if [ ! -f .env ]; then
  echo "✗ No .env found. This looks like a fresh checkout, not an update to an"
  echo "  existing setup — run ./scripts/setup-local.sh instead (one-time setup)."
  exit 1
fi

echo "== Installing dependencies =="
npm install

echo "== Clearing build cache =="
rm -rf .next

if [ "$PROD" = true ]; then
  echo "== Building for production =="
  npm run build
  echo "== Starting production server =="
  npm run start
else
  echo "== Starting dev server =="
  echo "(schema/data untouched — if this update includes a schema change,"
  echo " you'll need to apply it manually: psql \"\$DATABASE_URL\" < db/schema.sql,"
  echo " or reset with ./scripts/setup-local.sh --reset if starting fresh is fine)"
  npm run dev
fi
