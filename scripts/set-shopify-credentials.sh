#!/usr/bin/env bash
# ============================================================================
# EMS — Set Shopify OAuth credentials on Railway
#
# Sets SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on your Railway app
# service, so the OAuth "Connect Shopify" flow in Admin -> Integrations
# has what it needs. See SHOPIFY_OAUTH_SETUP.md for the full picture
# (this script only covers step 3 of that doc — the Railway env vars).
#
# Get the two values from: Shopify Dev Dashboard -> your "EMS" app ->
# Settings -> Credentials (Client ID, and Secret behind the eye icon).
#
# Usage:
#   ./scripts/set-shopify-credentials.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v railway &> /dev/null; then
  echo "✗ Railway CLI not found. Install: npm install -g @railway/cli"
  exit 1
fi

echo "== Linking to your Railway project's APP service =="
echo "   (pick the same project as before; when asked for a service, select"
echo "    your app service — not Postgres, this one needs env vars set on"
echo "    the app itself)"
railway link

read -p "Shopify Client ID: " CLIENT_ID
read -sp "Shopify Client Secret (hidden): " CLIENT_SECRET
echo ""

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "✗ Both values are required — nothing was set."
  exit 1
fi

echo "== Setting SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on Railway =="
railway variables --set "SHOPIFY_CLIENT_ID=$CLIENT_ID" --set "SHOPIFY_CLIENT_SECRET=$CLIENT_SECRET"

echo ""
echo "✓ Done. Railway will redeploy automatically with the new variables."
echo "  Once that finishes, try 'Connect Shopify' in EMS -> Admin -> Integrations."
