-- Adds status (active/inactive) to expense_categories and expense_subcategories,
-- so one with real vouchers posted to it can be disabled instead of deleted —
-- disabled ones drop out of the Expense voucher dropdown for new entries,
-- but every past voucher, and Cash Balance / Expense reports, are never
-- touched. Delete itself is unchanged: still blocked if any real voucher
-- exists under the category/sub-category.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/006_expense_category_status.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/006_expense_category_status.sql

alter table expense_categories add column if not exists status text not null default 'active';
alter table expense_subcategories add column if not exists status text not null default 'active';
