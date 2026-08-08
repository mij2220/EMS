#!/usr/bin/env bash
# ============================================================================
# EMS — Deploy a fresh download
#
# Run this FROM INSIDE a newly downloaded and unzipped ems-app folder (the
# one with no .env and no .git — a plain fresh copy of the code). It syncs
# that new code into your REAL, already-set-up project folder — the one
# with your .env, your database connection, and your git/GitHub link —
# without disturbing any of those.
#
# Usage:
#   ./scripts/deploy-update.sh                          # uses the default path below
#   ./scripts/deploy-update.sh /path/to/real/ems-app     # or specify it explicitly
# ============================================================================
set -euo pipefail
FRESH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${1:-$HOME/Documents/Products/EMS/ems-app}"

echo "== EMS Deploy Update =="
echo "Fresh download:      $FRESH_DIR"
echo "Your real project:   $TARGET_DIR"
echo ""

if [ "$FRESH_DIR" = "$TARGET_DIR" ]; then
  echo "✗ These are the same folder — this script is meant to be run from a"
  echo "  freshly downloaded copy, syncing INTO your separate real project folder."
  echo "  Usage: ./scripts/deploy-update.sh /path/to/your/real/ems-app"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "✗ $TARGET_DIR doesn't exist."
  echo "  Pass the correct path to your real project folder as an argument:"
  echo "    ./scripts/deploy-update.sh /path/to/your/real/ems-app"
  exit 1
fi

if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "✗ $TARGET_DIR doesn't look like your real project (no .git found there)."
  echo "  Double check the path — this should point at the folder connected"
  echo "  to your GitHub repo, not another fresh download."
  exit 1
fi

echo "== Syncing new code in (your .env, .git, node_modules, .next are left alone) =="
rsync -av --exclude 'node_modules' --exclude '.env' --exclude '.git' --exclude '.next' \
  "$FRESH_DIR/" "$TARGET_DIR/"

cd "$TARGET_DIR"

echo ""
echo "== Installing dependencies =="
npm install

if [ -f .env ]; then
  echo ""
  echo "== Applying any pending database migrations (local) =="
  chmod +x scripts/apply-migrations.sh
  ./scripts/apply-migrations.sh
else
  echo ""
  echo "⚠ No .env found here — skipping local migrations. Run ./scripts/setup-local.sh first."
fi

echo ""
echo "== Rebuilding =="
rm -rf .next
npm run build

echo ""
echo "✓ Local update complete. Run 'npm run dev' to try it, or 'npm run start' to test the production build."
echo ""

read -p "Also ship this to Railway now (commit, push, and optionally migrate the live database)? [y/N] " DO_RAILWAY
if [[ "$DO_RAILWAY" =~ ^[Yy]$ ]]; then
  chmod +x scripts/deploy-railway.sh
  ./scripts/deploy-railway.sh
fi
