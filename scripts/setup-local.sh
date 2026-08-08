#!/usr/bin/env bash
# ============================================================================
# EMS — Local Setup Script (native Postgres, no Docker)
#
# Sets up your local environment using Postgres installed directly on your
# Mac — via Homebrew or Postgres.app — rather than Docker. Safe to re-run.
#
# Usage:
#   ./scripts/setup-local.sh            # normal setup — won't touch existing data
#   ./scripts/setup-local.sh --reset    # wipes and re-seeds an existing database
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

RESET=false
for arg in "$@"; do
  case $arg in
    --reset) RESET=true ;;
  esac
done

echo "== EMS Local Setup (native Postgres) =="

# ---- 1. Node version check ----
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node $(node -v) found — this project needs Node 20 or newer."
  echo "  Install with: nvm install 20 && nvm use 20"
  exit 1
fi
echo "✓ Node $(node -v)"

# ---- 2. Postgres check ----
if ! command -v psql &> /dev/null; then
  echo "✗ psql not found — Postgres isn't installed (or isn't on your PATH)."
  echo ""
  echo "  Install it with Homebrew:"
  echo "    brew install postgresql@16"
  echo "    brew services start postgresql@16"
  echo ""
  echo "  Or install Postgres.app instead: https://postgresapp.com/"
  echo "  Then re-run this script."
  exit 1
fi
echo "✓ psql found"

if ! pg_isready -q 2>/dev/null; then
  echo "✗ Postgres doesn't seem to be running."
  echo "  If you installed via Homebrew: brew services start postgresql@16"
  echo "  If you use Postgres.app: open it from Applications and click Start"
  exit 1
fi
echo "✓ Postgres is running"

# ---- 3. Figure out how to connect ----
# Mac-native Postgres (Homebrew or Postgres.app) almost always creates a
# superuser role matching your macOS username, with no password required for
# local connections. This tries that first, since it's the common case; if
# your setup is different (a password-protected role, a different port),
# this will fail clearly and tell you what to fix in .env by hand.
MAC_USER=$(whoami)
DB_NAME="ems_dev"

if ! psql "postgresql://${MAC_USER}@localhost:5432/postgres" -c "select 1" &> /dev/null; then
  echo "✗ Could not connect as '${MAC_USER}' with no password — your Postgres setup"
  echo "  differs from the common default. Connect manually to confirm your"
  echo "  username/password/port, then set DATABASE_URL in .env yourself, e.g.:"
  echo "    DATABASE_URL=\"postgresql://youruser:yourpassword@localhost:5432/ems_dev\""
  echo "  Then re-run this script — it will skip straight past this check next time"
  echo "  once .env already has a working DATABASE_URL."
  exit 1
fi
echo "✓ Connected as '${MAC_USER}' with no password (the common Mac-native default)"

# ---- 4. Create the database if it doesn't exist ----
DB_EXISTS=$(psql "postgresql://${MAC_USER}@localhost:5432/postgres" -tAc \
  "select 1 from pg_database where datname='${DB_NAME}'")
if [ "$DB_EXISTS" != "1" ]; then
  echo "== Creating database '${DB_NAME}' =="
  createdb "$DB_NAME"
else
  echo "✓ Database '${DB_NAME}' already exists"
fi

DATABASE_URL="postgresql://${MAC_USER}@localhost:5432/${DB_NAME}"

# ---- 5. .env setup ----
if [ ! -f .env ]; then
  echo "== Creating .env =="
  cp .env.example .env
  SECRET=$(openssl rand -base64 32)
  sed -i '' "s#change-this-to-a-long-random-string#${SECRET}#" .env
  sed -i '' "s#postgresql://youruser@localhost:5432/ems_dev#${DATABASE_URL}#" .env
  echo "✓ .env created with a fresh JWT_SECRET and your detected DATABASE_URL"
else
  echo "✓ .env already exists — leaving it as-is (edit DATABASE_URL by hand if it's wrong)"
fi

# ---- 6. Schema ----
TABLE_COUNT=$(psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.tables where table_schema='public';")

if [ "$RESET" = true ] || [ "$TABLE_COUNT" -eq 0 ]; then
  if [ "$RESET" = true ] && [ "$TABLE_COUNT" -gt 0 ]; then
    echo "== --reset: wiping existing data =="
    psql "$DATABASE_URL" -c "TRUNCATE tenants CASCADE;" || true
  fi
  if [ "$TABLE_COUNT" -eq 0 ]; then
    echo "== Applying schema =="
    psql "$DATABASE_URL" -f db/schema.sql
    if [ -d db/migrations ] && [ -n "$(ls -A db/migrations 2>/dev/null)" ]; then
      for file in db/migrations/*.sql; do
        psql "$DATABASE_URL" -c "insert into schema_migrations (filename) values ('$(basename "$file")') on conflict do nothing;" > /dev/null
      done
    fi
  fi

  echo "== Installing dependencies =="
  npm install

  echo "== Seeding real Aimexa Store data =="
  node --env-file=.env --import tsx scripts/seed.ts
else
  echo "== Installing dependencies =="
  npm install
  echo "== Applying any pending migrations =="
  chmod +x scripts/apply-migrations.sh
  ./scripts/apply-migrations.sh "$DATABASE_URL"
  echo "✓ Database already has data — skipping seed (use --reset to wipe and reload)"
fi

echo ""
echo "== Done =="
echo "Run:  npm run dev"
echo "Open: http://localhost:3000"
