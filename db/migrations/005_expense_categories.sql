-- Adds a real Category / Sub-category structure for Expense vouchers,
-- replacing the flat hardcoded dropdown list. Pre-populates every existing
-- tenant with the categories that were previously hardcoded in the UI, so
-- existing "Expense — X" accounts/vouchers stay meaningful and the
-- categories people already use don't just vanish from the dropdown.
--
-- Local:   psql "$DATABASE_URL" -f db/migrations/005_expense_categories.sql
-- Railway: psql "PASTE_DATABASE_PUBLIC_URL_HERE" -f db/migrations/005_expense_categories.sql

create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists expense_subcategories (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  category_id   uuid not null references expense_categories(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (category_id, name)
);

insert into expense_categories (tenant_id, name)
select t.id, c.name
from tenants t
cross join (values ('Utility Bill'), ('Shipping / Courier Fee'), ('Packaging'), ('Rent'), ('Marketing'), ('Miscellaneous')) as c(name)
on conflict (tenant_id, name) do nothing;
