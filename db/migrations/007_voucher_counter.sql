-- Fixes a real production bug: voucher numbers were generated via
-- "SELECT count(*)+1", which is unsafe under concurrent requests — two
-- requests close together can both read the same count before either
-- commits, then collide on the (tenant_id, voucher_number) unique
-- constraint. This happened for real in production (VCH-0044 collision,
-- 2026-08-26).
--
-- Adds a dedicated per-tenant counter table, seeded from each tenant's
-- actual highest existing voucher number (never resets anyone to VCH-0001
-- and collides with real history) — voucher_number is stored as e.g.
-- "VCH-0044"; the numeric part is extracted defensively so any voucher
-- that doesn't match that exact format is simply ignored rather than
-- breaking the migration.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/007_voucher_counter.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/007_voucher_counter.sql

create table if not exists voucher_counters (
  tenant_id    uuid primary key references tenants(id),
  next_number  integer not null default 1
);

-- Seed every tenant that already has vouchers, using their real highest
-- number so far — the counter stores "the last number used", and the next
-- call correctly increments from there (see nextVoucherNumber in
-- src/lib/accounts-helpers.ts for the matching application-side logic).
insert into voucher_counters (tenant_id, next_number)
select
  v.tenant_id,
  max((regexp_match(v.voucher_number, '^VCH-(\d+)$'))[1]::integer)
from vouchers v
where v.voucher_number ~ '^VCH-\d+$'
group by v.tenant_id
on conflict (tenant_id) do update set next_number = excluded.next_number;

-- Tenants with no vouchers yet (or none matching the format above) don't
-- need a row at all — nextVoucherNumber's INSERT path correctly starts
-- them at 1 the first time it's called.
