#!/usr/bin/env bash
# ============================================================================
# EMS — Deploy changes to Railway
#
# For ONGOING deploys, after the one-time Railway project setup is already
# done (Postgres plugin added, DATABASE_URL/JWT_SECRET set on the app
# service, GitHub repo connected). If you haven't done that yet, see the
# README's Railway section instead.
#
# What this does:
#   1. Builds locally first — fails fast here instead of on Railway if
#      something's broken
#   2. Commits and pushes to GitHub — Railway auto-deploys on push (this is
#      how your existing deployment already gets updated)
#   3. Optionally re-applies db/schema.sql and/or reseeds the LIVE database,
#      if this change included a schema change
#
# IMPORTANT — read before using the schema/seed step:
# A real deployment session surfaced something worth knowing: Railway's
# reference-variable syntax (${{Postgres.DATABASE_URL}}) resolves to
# Postgres's *internal* address (postgres.railway.internal), which is only
# reachable from inside Railway's network — never from your Mac. Running
# `railway run` while linked to your APP service will inherit that internal
# value and fail with a DNS error, even though it looks like it should work.
# The fix that was actually confirmed to work: link to the POSTGRES service
# specifically — it carries its own DATABASE_PUBLIC_URL variable (a real,
# externally-reachable address), not just the internal one. This script
# does that automatically below. Still, this exact automated version
# hasn't been run end-to-end the way the rest of this project has — if it
# doesn't work, the manual fallback (copy DATABASE_PUBLIC_URL from the
# Postgres service's Variables tab by hand) is what actually got you
# deployed last time, and will still work here.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== EMS Railway Deploy =="

# ---- 1. Build locally first ----
echo "== Building locally (catches errors before they reach Railway) =="
npm install
npm run build
rm -rf .next

# ---- 2. Commit and push ----
if [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "== Uncommitted changes found =="
  git status --short
  read -p "Commit message: " COMMIT_MSG
  git add -A
  git commit -m "${COMMIT_MSG:-Update}"
else
  echo "== No uncommitted changes — nothing new to push =="
fi

echo "== Pushing to GitHub (Railway will auto-deploy from this) =="
git push

echo ""
echo "✓ Pushed. Railway should start building automatically — check the"
echo "  Deployments tab in your Railway project to watch it."

# ---- 3. Optional: migrations / seed against the live database ----
echo ""
read -p "Does this change include a NEW migration file in db/migrations/, or do you want to reseed? [y/N] " DO_SCHEMA
if [[ "$DO_SCHEMA" =~ ^[Yy]$ ]]; then
  if ! command -v railway &> /dev/null; then
    echo "✗ Railway CLI not found. Install: npm install -g @railway/cli"
    exit 1
  fi

  echo "== Linking to your Railway project's Postgres service =="
  echo "   (pick the same project as before; when asked for a service, select Postgres specifically — not your app service)"
  railway link

  echo "== Applying any pending migrations (safe to run even if there's nothing new — already-applied ones are skipped) =="
  chmod +x scripts/apply-migrations.sh
  railway run bash -c './scripts/apply-migrations.sh "$DATABASE_PUBLIC_URL"' || {
    echo "✗ That failed. Most likely DATABASE_PUBLIC_URL isn't available this way."
    echo "  Fall back to the manual method: open Railway → Postgres service →"
    echo "  Variables tab → copy DATABASE_PUBLIC_URL → run by hand:"
    echo '    ./scripts/apply-migrations.sh "PASTE_DATABASE_PUBLIC_URL_HERE"'
    exit 1
  }

  read -p "Also reseed with fresh demo data? This WIPES the live database's current data. [y/N] " DO_SEED
  if [[ "$DO_SEED" =~ ^[Yy]$ ]]; then
    railway run bash -c 'psql "$DATABASE_PUBLIC_URL" -c "TRUNCATE tenants CASCADE;"'
    railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node --import tsx scripts/seed.ts'
  fi
fi

echo ""
echo "== Done =="
