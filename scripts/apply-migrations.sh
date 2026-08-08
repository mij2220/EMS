#!/usr/bin/env bash
# ============================================================================
# EMS — Apply pending migrations
#
# Applies every file in db/migrations/ that hasn't already been applied to
# the target database, tracked via the schema_migrations table (created
# automatically by schema.sql on a fresh database, or created here if
# missing on an older one). Safe to run repeatedly — already-applied
# migrations are skipped, not re-run.
#
# Usage:
#   ./scripts/apply-migrations.sh "postgresql://..."
#   ./scripts/apply-migrations.sh                  # reads DATABASE_URL from .env
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="${1:-}"
if [ -z "$DB_URL" ]; then
  if [ -f .env ]; then
    DB_URL=$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//' | tr -d '"')
  fi
fi
if [ -z "$DB_URL" ]; then
  echo "✗ No DATABASE_URL provided and none found in .env."
  echo "  Usage: ./scripts/apply-migrations.sh \"postgresql://...\""
  exit 1
fi

# Make sure the tracking table exists even on a database created before it did
psql "$DB_URL" -c "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now());" > /dev/null

if [ ! -d db/migrations ] || [ -z "$(ls -A db/migrations 2>/dev/null)" ]; then
  echo "✓ No migrations to apply."
  exit 0
fi

APPLIED_ANY=false
for file in $(ls db/migrations/*.sql | sort); do
  filename=$(basename "$file")
  already=$(psql "$DB_URL" -tAc "select 1 from schema_migrations where filename='$filename';")
  if [ "$already" = "1" ]; then
    echo "✓ $filename — already applied, skipping"
    continue
  fi
  echo "== Applying $filename =="
  psql "$DB_URL" -f "$file"
  psql "$DB_URL" -c "insert into schema_migrations (filename) values ('$filename');" > /dev/null
  echo "✓ $filename — applied and recorded"
  APPLIED_ANY=true
done

if [ "$APPLIED_ANY" = false ]; then
  echo "✓ Database already up to date — nothing to apply."
fi
