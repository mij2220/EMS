-- Adds a run-history table for integration syncs (Shopify's auto-sync
-- scheduler plus the manual "Sync with Shopify"/"Sync Sales" buttons), so
-- Admin -> Sync Logs can show when syncs last ran and what happened,
-- instead of that only being visible as scrollback in Railway's logs.
--
-- One row per completed sync operation, inserted once the operation
-- finishes (not created-then-updated) — inventory and sales are logged
-- separately since they're triggered independently by the manual buttons.
-- `provider` is included even though only 'shopify' exists today, so this
-- doesn't need another migration if a second integration (e.g. a courier
-- API) gets its own sync logging later.
--
-- Deliberately time-bounded — retention (2 days) is enforced in
-- application code (the scheduler deletes old rows after each run, see
-- instrumentation.ts), not here, so it stays adjustable without another
-- migration.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/003_sync_logs.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/003_sync_logs.sql

create table if not exists sync_logs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  provider     text not null,                 -- 'shopify' (room for other integrations later)
  sync_type    text not null,                 -- 'inventory' | 'sales'
  trigger      text not null,                 -- 'scheduler' | 'manual'
  started_at   timestamptz not null,
  finished_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  ok           boolean not null,
  summary      jsonb,
  error        text
);

create index if not exists idx_sync_logs_tenant_created
  on sync_logs (tenant_id, created_at desc);
