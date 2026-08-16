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
# Each step opens its own psql connection (no persistent session), and
# Railway's public TCP proxy has been observed to drop a connection under
# that rapid churn ("server closed the connection unexpectedly") even
# though nothing is actually wrong with the database or the SQL — so every
# psql call here is wrapped with automatic retries instead of failing the
# whole script on a single transient blip.
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

# Retries a psql invocation up to 5 times with a short backoff before
# giving up for real. Args are passed straight through to psql.
psql_retry() {
  local attempt=1
  local max_attempts=5
  until psql "$DB_URL" "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "✗ psql failed after $max_attempts attempts — giving up."
      return 1
    fi
    echo "  (connection hiccup, retrying in 2s — attempt $((attempt + 1))/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
  done
}

# Make sure the tracking table exists even on a database created before it did
psql_retry -c "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now());" > /dev/null

if [ ! -d db/migrations ] || [ -z "$(ls -A db/migrations 2>/dev/null)" ]; then
  echo "✓ No migrations to apply."
  exit 0
fi

APPLIED_ANY=false
for file in $(ls db/migrations/*.sql | sort); do
  filename=$(basename "$file")
  already=$(psql_retry -tAc "select 1 from schema_migrations where filename='$filename';")
  if [ "$already" = "1" ]; then
    echo "✓ $filename — already applied, skipping"
    continue
  fi
  echo "== Applying $filename =="
  psql_retry -f "$file"
  psql_retry -c "insert into schema_migrations (filename) values ('$filename');" > /dev/null
  echo "✓ $filename — applied and recorded"
  APPLIED_ANY=true
done

if [ "$APPLIED_ANY" = false ]; then
  echo "✓ Database already up to date — nothing to apply."
fi
