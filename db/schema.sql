-- ============================================================================
-- EMS (Ecommerce Management System) — Database Schema
-- Target: PostgreSQL 15+
-- Scope: matches the validated UI/UX mockup and SRD v1.2
-- Convention: UUID primary keys, tenant_id on every tenant-owned table for
-- row-level multi-tenancy (per SRD Section 11), soft-delete via is_active/
-- deactivated_at rather than hard deletes on anything with financial history.
-- Tables are ordered so every foreign key points to a table already created
-- above it — this file runs top to bottom with no forward-reference patching.
-- ============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- Tracks which files from db/migrations/ have already been applied to this
-- database, so scripts can apply only what's new instead of relying on a
-- person to remember which migrations they've already run. A fresh
-- database created from this schema.sql is already fully up to date, so it
-- doesn't need any of db/migrations/ applied — see scripts/apply-migrations.sh.
create table if not exists schema_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now()
);

-- ============================================================================
-- TENANCY
-- ============================================================================

create table tenants (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null,
  logo_url          text,
  address           text,
  currency          text not null default 'PKR',
  timezone          text not null default 'Asia/Karachi',
  order_number_prefix    text default 'AX-',
  voucher_number_prefix  text default 'VCH-',
  tax_rate_percent  numeric(5,2),              -- null = not applicable (SRD 15.3)
  created_at        timestamptz not null default now()
);

-- ============================================================================
-- ADMIN & ACCESS CONTROL  (SRD Section 10)
-- ============================================================================

create table roles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  name          text not null,                  -- e.g. 'Owner / Admin', 'Warehouse — Inventory only'
  is_custom     boolean not null default false,
  cloned_from   uuid references roles(id),
  created_at    timestamptz not null default now(),
  unique (tenant_id, name)
);

-- One row per (role, module). SRD 10.3's permission matrix.
create table permissions (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references roles(id) on delete cascade,
  module        text not null,                  -- 'inventory' | 'sales' | 'accounts' | 'courier' | 'customers' | 'reporting' | 'admin'
  can_view      boolean not null default false,
  can_create    boolean not null default false,
  can_edit      boolean not null default false,
  can_delete    boolean not null default false,
  can_approve   boolean not null default false,
  unique (role_id, module)
);

create table users (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  role_id           uuid not null references roles(id),
  name              text not null,
  email             text not null,
  phone             text,
  password_hash     text not null,
  two_fa_enabled    boolean not null default false,
  two_fa_method     text,                       -- 'sms' | 'whatsapp' | 'authenticator' — backlogged per SRD 15.2
  status            text not null default 'invited', -- 'invited' | 'active' | 'deactivated'
  last_login_at     timestamptz,
  invited_at        timestamptz not null default now(),
  deactivated_at    timestamptz,
  unique (tenant_id, email)
);

create table integration_credentials (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  provider          text not null,               -- 'shopify' | 'woocommerce' | 'courier:m_and_p' | 'courier:leopards' | ...
  store_url         text,
  credentials_encrypted  bytea,                   -- encrypted at rest; never return raw in API responses
  sync_frequency_minutes int default 30,
  status            text not null default 'disconnected', -- 'connected' | 'disconnected' | 'error'
  last_sync_at      timestamptz,
  last_error         text,
  created_at        timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table audit_log (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id),
  user_id       uuid references users(id),
  module        text not null,
  action        text not null,
  before_value  jsonb,
  after_value   jsonb,
  created_at    timestamptz not null default now()
);
create index idx_audit_log_tenant_time on audit_log (tenant_id, created_at desc);

-- ============================================================================
-- INVENTORY  (SRD Section 4)
-- ============================================================================

create table locations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  name          text not null,                   -- e.g. 'Aimexa Store'
  address       text,
  is_default    boolean not null default true
);

create table products (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  handle        text not null,                   -- Shopify-style slug, unique per tenant
  title         text not null,
  channel       text not null default 'manual',  -- 'shopify' | 'woocommerce' | 'manual'
  status        text not null default 'active',  -- 'active' | 'draft' | 'archived'
  image_url     text,
  country_of_origin  text,
  option1_name  text default 'Color',
  option2_name  text default 'Size',
  option3_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, handle)
);

create table variants (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id) on delete cascade,
  sku               text,                        -- intentionally nullable — SKU governance rule in SRD 4.2
  option1_value     text,
  option2_value     text,
  option3_value     text,
  hs_code           text,
  location_id       uuid references locations(id),
  bin_name          text,
  cost_price        numeric(12,2),
  sale_price        numeric(12,2),
  on_hand           integer not null default 0,
  reserved          integer not null default 0,  -- packed-but-not-yet-delivered units (SRD 6.4)
  reorder_level     integer not null default 30,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_variants_product on variants (product_id);
create index idx_variants_sku on variants (sku) where sku is not null;

create table stock_adjustments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  variant_id    uuid not null references variants(id),
  qty_delta     integer not null,                -- signed: + add, - remove
  reason_code   text not null,                    -- 'damaged' | 'sample' | 'recount' | 'returned_to_stock' | 'received_po' | 'other'
  note          text,
  user_id       uuid not null references users(id),
  created_at    timestamptz not null default now()
);
create index idx_stock_adj_variant on stock_adjustments (variant_id, created_at desc);

create table vendors (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  name          text not null,
  contact       text,
  created_at    timestamptz not null default now()
);

create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  vendor_id     uuid not null references vendors(id),
  status        text not null default 'pending', -- 'pending' | 'partial' | 'received'
  ordered_at    timestamptz not null default now(),
  received_at   timestamptz
);

create table purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  variant_id        uuid not null references variants(id),
  qty_ordered       integer not null,
  qty_received      integer not null default 0,
  cost_price        numeric(12,2) not null
);

-- ============================================================================
-- CUSTOMERS  (SRD Section 8)
-- ============================================================================

create table customers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  name          text not null,
  phone         text not null,                   -- primary match key for auto-creation from sales
  city          text,
  address       text,
  first_order_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (tenant_id, phone)
);
create index idx_customers_phone on customers (tenant_id, phone);

-- ============================================================================
-- ACCOUNTS  (SRD Section 5) — created before Courier/Sales, since both
-- reference accounts/vouchers.
-- ============================================================================

create table accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  name          text not null,                       -- 'Cash', 'Bank', 'Vendor — Lyallpur Textiles', 'Courier Receivable — M&P', ...
  type          text not null,                        -- 'cash' | 'bank' | 'payable' | 'receivable' | 'expense' | 'equity' | 'sales' | 'inventory'
  reference_id  uuid,                                 -- optional FK to vendors.id / couriers.id / employees.id depending on type
  created_at    timestamptz not null default now(),
  unique (tenant_id, name)
);

create table employees (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  name            text not null,
  role            text,
  base_salary     numeric(12,2),
  advance_balance numeric(12,2) not null default 0,
  user_id         uuid references users(id),           -- nullable: not every employee needs system login (SRD 15.4)
  created_at      timestamptz not null default now()
);

create table vouchers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  voucher_number    text not null,
  voucher_type      text not null,                      -- 'cash_payment' | 'cash_receipt' | 'vendor_purchase' | 'salary' | 'expense' | 'journal'
  voucher_date      date not null,
  debit_account_id  uuid not null references accounts(id),
  credit_account_id uuid not null references accounts(id),
  amount            numeric(12,2) not null,
  reference         text,
  attachment_url    text,
  vendor_voucher_number text,                            -- the physical paper voucher's own number, distinct from voucher_number above
  unit_type         text,                                -- 'qty' | 'kg' | 'feet' | ... — free text, whatever the vendor's slip uses
  total_units       numeric(12,2),
  photo_data        bytea,                               -- the voucher photo itself, stored inline (no external object storage configured)
  photo_mime_type   text,
  entered_by        uuid not null references users(id),
  created_at        timestamptz not null default now(),
  unique (tenant_id, voucher_number),
  check (debit_account_id <> credit_account_id)
);
create index idx_vouchers_date on vouchers (tenant_id, voucher_date desc);
create index idx_vouchers_accounts on vouchers (debit_account_id, credit_account_id);

-- ============================================================================
-- COURIER  (SRD Section 7) — courier master goes before Orders, since
-- orders.courier_id references it.
-- ============================================================================

create table couriers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id),
  name                  text not null,             -- 'M&P', 'Leopards', 'TCS'...
  mode                  text not null default 'manual', -- 'api' | 'manual' | 'api_and_manual'
  remittance_cycle_days integer not null default 7,
  commission_percent    numeric(5,2) default 0,
  commission_flat       numeric(12,2) default 0,
  contact               text,
  created_at            timestamptz not null default now(),
  unique (tenant_id, name)
);

-- ============================================================================
-- SALES & DELIVERY  (SRD Section 6)
-- ============================================================================

create table orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  order_number      text not null,                  -- e.g. '1051027' or 'AX-1051027'
  customer_id       uuid not null references customers(id),
  courier_id        uuid references couriers(id),
  tracking_number   text,
  payment_type      text not null,                   -- 'cod' | 'cash'
  source            text not null default 'manual_pdf', -- 'shopify_sync' | 'manual_pdf' | 'woocommerce'
  status            text not null default 'pending',  -- pending|packed|dispatched|in_transit|delivered|returned  (SRD 6.4)
  inventory_deducted boolean not null default false,   -- true only once status has reached 'delivered'
  remarks           text,
  placed_at         timestamptz not null default now(),
  packed_at         timestamptz,
  dispatched_at     timestamptz,
  delivered_at      timestamptz,
  returned_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (tenant_id, order_number)
);
create index idx_orders_status on orders (tenant_id, status);
create index idx_orders_customer on orders (customer_id);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  variant_id    uuid not null references variants(id),
  qty           integer not null,
  unit_price    numeric(12,2) not null,             -- captured at sale time — do not recompute from variant later
  unit_cost     numeric(12,2) not null              -- captured at sale time, for historically-accurate profit reporting
);
create index idx_order_items_order on order_items (order_id);

-- Raw import tracking for the PDF-import flow (SRD 6.2)
create table pdf_imports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  courier_id    uuid references couriers(id),
  file_name     text not null,
  orders_matched integer not null default 0,
  orders_total   integer not null default 0,
  status        text not null default 'complete',    -- 'complete' | 'partial' | 'failed'
  imported_by   uuid references users(id),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- COURIER LEDGER & REMITTANCE — created last: these reference orders,
-- couriers, and vouchers, all of which now already exist.
-- ============================================================================

-- Running per-courier ledger; every dispatch credits, every remittance debits.
-- Mirrors the convention already validated in the mockup's Courier Detail page.
create table courier_ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  courier_id    uuid not null references couriers(id),
  order_id      uuid references orders(id),
  entry_type    text not null,                      -- 'dispatch_credit' | 'remittance_debit' | 'return_reversal'
  amount        numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  voucher_id    uuid references vouchers(id),
  created_at    timestamptz not null default now()
);
create index idx_courier_ledger_courier on courier_ledger_entries (courier_id, created_at desc);

create table courier_remittance_batches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  courier_id    uuid not null references couriers(id),
  batch_number  text not null,
  amount        numeric(12,2) not null,
  voucher_id    uuid references vouchers(id),
  status        text not null default 'posted',      -- 'posted' | 'pending'
  created_at    timestamptz not null default now()
);

create table courier_remittance_orders (
  remittance_batch_id  uuid not null references courier_remittance_batches(id) on delete cascade,
  order_id             uuid not null references orders(id),
  slip_amount          numeric(12,2) not null,
  remitted_amount      numeric(12,2),                -- null until reconciled; may differ (fee deducted)
  primary key (remittance_batch_id, order_id)
);

-- ============================================================================
-- NOTES FOR THE DEV TEAM
-- ============================================================================
-- 1. Every tenant-owned table carries tenant_id for row-level security (RLS).
--    Turn on RLS policies per table once auth/session context is wired up:
--      alter table X enable row level security;
--      create policy tenant_isolation on X using (tenant_id = current_setting('app.tenant_id')::uuid);
-- 2. "accounts" is intentionally a flat list, not a hierarchical chart of
--    accounts — matches the Phase 1 "practical ledger" decision (SRD 5.5).
-- 3. Vendor/Courier/Employee "running balance" is NOT a stored column — it is
--    always derived by summing vouchers against that account, so it can never
--    drift out of sync with the ledger. Cache it in Redis/materialized view
--    only if read performance becomes an issue.
-- 4. order.status drives variant.on_hand: deduct at 'delivered', restock on
--    'returned' only if inventory_deducted was already true (SRD 6.4).
