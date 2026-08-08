-- Adds voucher detail fields (physical voucher #, unit type/quantity, photo)
-- to an EXISTING database that already has data. Safe to run more than
-- once — every column uses "if not exists".
--
-- Run this against any database that was seeded before this feature existed
-- (your local one, and the live Railway one), instead of re-applying the
-- full schema.sql, which won't add columns to a table that already exists.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/001_voucher_photo_and_units.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/001_voucher_photo_and_units.sql

alter table vouchers add column if not exists vendor_voucher_number text;
alter table vouchers add column if not exists unit_type text;
alter table vouchers add column if not exists total_units numeric(12,2);
alter table vouchers add column if not exists photo_data bytea;
alter table vouchers add column if not exists photo_mime_type text;
