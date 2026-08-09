-- Adds status (active/inactive) to vendors and employees, so a vendor or
-- employee with real transaction history can be disabled instead of
-- deleted, rather than either blocking the action entirely or corrupting
-- historical vouchers by removing the record they reference.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/002_vendor_employee_status.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/002_vendor_employee_status.sql

alter table vendors add column if not exists status text not null default 'active';
alter table employees add column if not exists status text not null default 'active';
