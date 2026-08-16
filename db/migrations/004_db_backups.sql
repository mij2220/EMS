-- Adds storage for full-database backups, downloadable/restorable from
-- Admin -> Database Backups.
--
-- Backups are stored as bytea rows INSIDE this same database, not as files
-- on the app server's disk — Railway's app container filesystem is
-- ephemeral (wiped on every redeploy/restart), so local files would defeat
-- the purpose. Storing them in Postgres itself means they survive app
-- restarts and deploys automatically, with zero extra infrastructure
-- (no Volume to attach, no external storage to configure).
--
-- IMPORTANT CAVEAT this does NOT cover: total loss of the Postgres volume
-- itself (disk failure, accidental service deletion, etc.) — a backup
-- stored inside the database it's backing up can't protect against the
-- whole database disappearing. For that class of disaster, Railway's own
-- Postgres service has a separate "Backups" tab (platform-level, stored
-- outside this database) — that's still the real safety net for physical
-- data loss. This table protects against *application-level* mistakes:
-- an accidental bad DELETE/UPDATE, a bug, or wanting to roll back to a
-- known-good point before a risky change.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/004_db_backups.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/004_db_backups.sql

create table if not exists db_backups (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  created_by_user_id uuid references users(id),
  size_bytes        bigint not null,
  is_pre_restore_snapshot boolean not null default false, -- true for the automatic safety backup taken right before a restore
  content           bytea not null
);

create index if not exists idx_db_backups_created_at on db_backups (created_at desc);
