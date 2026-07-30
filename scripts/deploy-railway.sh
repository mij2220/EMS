#!/usr/bin/env bash
# ============================================================================
# EMS — Railway Deployment Script
#
# IMPORTANT — read before running:
# This script was written carefully against Railway's documented CLI, but it
# could NOT be run end-to-end against a real Railway account while building
# it — the environment this was built in has no network access to
# railway.app. Every other script and every application feature in this
# project was tested for real; this one specifically was not. Run it a step
# at a time the first time (comment out the later steps, or just paste the
# commands one by one from here into your terminal) rather than trusting it
# blindly, and if any command's flags don't match what your installed
# `railway` CLI expects, run `railway <command> --help` to check the current
# syntax — Railway's CLI does change between versions.
#
# What this does:
#   1. Checks the Railway CLI is installed
#   2. Logs you in (opens a browser)
#   3. Links this folder to a Railway project (creates one if you don't have one)
#   4. Adds a PostgreSQL plugin
#   5. Sets JWT_SECRET and wires DATABASE_URL to the Postgres plugin
#   6. Deploys the app
#   7. Applies the schema and seeds real data on the deployed database
#   8. Prints your live URL
#
# Usage:
#   ./scripts/deploy-railway.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== EMS Railway Deployment =="

# ---- 1. Railway CLI check ----
if ! command -v railway &> /dev/null; then
  echo "✗ Railway CLI not found."
  echo "  Install it with:  npm install -g @railway/cli"
  echo "  (or see https://docs.railway.app/guides/cli for other install methods)"
  exit 1
fi
echo "✓ Railway CLI found ($(railway --version 2>/dev/null || echo 'version unknown'))"

# ---- 2. Login ----
echo "== Logging in (this opens a browser window) =="
railway login

# ---- 3. Link or create a project ----
echo ""
echo "== Project setup =="
echo "If you already have a Railway project for this app, choose to link it below."
echo "If not, choose to create a new one."
railway init || railway link

# ---- 4. Add PostgreSQL ----
echo ""
echo "== Adding PostgreSQL =="
echo "If a Postgres plugin already exists on this project, Railway will just use it."
railway add --database postgres || echo "⚠ If this failed, add PostgreSQL manually from the Railway dashboard: New -> Database -> PostgreSQL"

# ---- 5. Environment variables ----
echo ""
echo "== Setting environment variables =="
SECRET=$(openssl rand -base64 32)
railway variables --set "JWT_SECRET=${SECRET}"
# This wires DATABASE_URL to whatever the Postgres plugin's connection string is,
# using Railway's reference-variable syntax, rather than hardcoding a copy of it —
# if Railway ever rotates the Postgres credentials, this stays correct automatically.
railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
echo "✓ JWT_SECRET generated and set (different from your local .env, as it should be)"
echo "✓ DATABASE_URL wired to the Postgres plugin"

# ---- 6. Deploy ----
echo ""
echo "== Deploying =="
railway up

# ---- 7. Schema + seed on the deployed database ----
echo ""
echo "== Applying schema to the deployed database =="
railway run bash -c 'psql "$DATABASE_URL" < db/schema.sql'

echo ""
read -p "Seed the deployed database with the real Aimexa Store demo data? [y/N] " SEED_CONFIRM
if [[ "$SEED_CONFIRM" =~ ^[Yy]$ ]]; then
  railway run node --import tsx scripts/seed.ts
else
  echo "Skipped seeding — the deployed database has tables but no data yet."
fi

# ---- 8. Done ----
echo ""
echo "== Done =="
railway domain || echo "Run 'railway domain' to generate a public URL if one wasn't created automatically."
echo ""
echo "Sanity-check the deployment the same way we tested it locally:"
echo '  curl -X POST https://<your-railway-url>/api/auth/login -H "Content-Type: application/json" -d '"'"'{"email":"owner@aimexa.store","password":"ChangeMe123!"}'"'"
