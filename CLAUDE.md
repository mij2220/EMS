# EMS (Aimexa Store) — Project Context for a New Chat

Read this first. This project has a long build history in a previous chat that got unwieldy —
this file exists so a fresh conversation can pick up accurately without re-deriving everything.

## ⚠️ IMPORTANT — this project has been worked on by more than one tool

As of this note, real Shopify order sync, database backup/restore, and sync-logging features
exist in this codebase (`src/lib/shopify-orders-sync.ts`, `src/lib/db-backup.ts`,
`src/lib/sync-logs.ts`, `/dashboard/admin/backups`, `/dashboard/admin/sync-logs`,
`src/instrumentation.ts`, migrations `003_sync_logs.sql` and `004_db_backups.sql`) that were
**built by a different tool, not by the Claude session that maintains this file** — most likely
Claude Code, based on the code style and `nixpacks.toml`/`instrumentation.ts` presence. That work
was never documented here, which caused a real, confusing incident: a Claude.ai chat's local
deploy script and a Claude Code session's local changes diverged, and neither this file nor the
deploy scripts had any way of knowing about the other's work until the user manually compared
against the actual GitHub repo.

**If you're picking this up fresh**: don't assume this file is a complete picture of the
codebase. Check the actual repo state (`git log`, `db/migrations/`, `src/lib/`) before trusting
this document's feature list as exhaustive — especially anything Shopify-order-sync, backup, or
sync-log related, which this file was never updated to describe. This project's client uses the
live app with real data — verify against the real GitHub repo before making changes, the same
way this note itself came from doing exactly that.

## What this is
A Next.js (App Router) full-stack app — frontend + backend API routes in one codebase
(`src/app/api/**/route.ts`, ~30 real endpoints) — backed by PostgreSQL via Kysely. Built against
a validated UI/UX mockup (`EMS_UI_UX_Mockup-14.html`, provided separately) for a Faisalabad
apparel COD business on Shopify.

**Source of truth for design/features:** `EMS_UI_UX_Mockup-14.html`. When in doubt about what a
screen should look like or contain, extract the real structure/data from that file directly
(it has 18 real screens: dashboard, inventory, inventory-reports, sales, sales-reports,
customers, accounts, account-reports, vendors, employees, courier, courier-reports,
product-detail, order-detail, customer-detail, courier-detail, voucher-detail, admin) —
don't reconstruct from memory or assumption.

## Expense Category / Sub-category — real Chart-of-Accounts style structure (this session)

Replaced the flat hardcoded 6-item Expense category dropdown with real `expense_categories` and
`expense_subcategories` tables, full CRUD via `/dashboard/accounts/categories` (add/edit/delete
both levels), and a cascading Category → Sub-category selector on the Expense voucher modal.
Migration is `005_expense_categories.sql` — correctly numbered after the real `004_db_backups.sql`
already in production, NOT `003` (an earlier attempt collided with the other tool's
`003_sync_logs.sql`, which is part of what caused the confusion described above).

Account naming matches the existing pattern everywhere else: `Expense — {category}` alone, or
`Expense — {category} — {sub}` when a sub-category is chosen. Renaming cascades to the account
name (same principle as renaming a vendor) — verified for real against the actual GitHub repo
(not a stale local copy): created a real voucher under Marketing → Meta Ads, renamed the category
to "Digital Marketing", confirmed the same voucher's account correctly updated, not orphaned.
Delete is blocked if anything under a category — the category itself or any sub-category — has
real vouchers, with the error naming the specific thing that's blocking it.

**Critically, this was built and tested against a fresh `git clone` of the real GitHub repo**,
not the local zip from a prior chat session — confirmed the existing Shopify sync, DB backup, and
sync-log features (built by the other tool) still work after this change, by hitting their pages
directly (`/dashboard/admin/backups`, `/dashboard/admin/sync-logs`) and getting clean 200s.

### Follow-up round: a real UI bug, plus Disable/Enable instead of destructive delete

**Bug found and fixed**: clicking "+ Sub-category" set the right state but the input field that
should appear was nested inside a *separate* `expanded` conditional that only the category-name
click toggles — so the button visibly focused but nothing appeared. Fixed by having the button
also expand the category. This wasn't a subcategory-creation bug at all; the API always worked
correctly (verified directly via curl before touching any frontend code) — it was purely that the
input to actually create one was invisible.

**Explicit design decision, not just built on request**: the user initially asked for deleting a
category to cascade-delete every voucher ever posted to it. Recommended against this directly —
retroactively deleting posted vouchers would silently change Cash Balance and past Expense Reports
on a live client's real data, which no serious accounting system does (QuickBooks/Xero included).
Built the same Disable-instead-of-Delete pattern already used for Vendors/Employees instead:
`expense_categories`/`expense_subcategories` gained a `status` column
(`006_expense_category_status.sql`). Delete stays exactly as before — blocked if any real voucher
exists under it. Disable is new — hides it from the Expense voucher's dropdown for *future* use
only. Verified for real: posted a real Rs 3,000 expense under Meta Ads, confirmed Delete is still
blocked, confirmed Disable succeeds, confirmed the Rs 3,000 voucher and Cash Balance are completely
unaffected afterward, and confirmed the disabled sub-category is correctly excluded from what a
new Expense voucher's dropdown would show (checked the exact filter logic against real API data).

Also cleaned up `db/migrations/003_expense_categories.sql` — an orphaned file from an earlier
numbering attempt that got accidentally swept into a commit; harmless (idempotent `if not exists`)
but confusing clutter, removed.

## Current build status (be precise about this — the user has been burned by overclaiming)

**Fully rebuilt to match the mockup exactly (real data, real columns, real filters, tested):**
- Inventory (list + detail) — all 37 real products / 133 variants, extracted directly from the
  mockup's own `PRODUCTS` JS object (see `scripts/mockup-products-data.js`), real photos, SKU/
  Cost/Sale Price/Profit columns, location + status filters, working Excel import/export, bulk
  select + delete (with FK-safe protection — products tied to real order history can't be
  bulk-deleted, reported back by name instead of silently failing)
- Sales & Delivery — Date/Payment/Source columns, courier + source filters, Import History modal
- Accounts → Vendor Purchase voucher — now captures date, the vendor's physical voucher number,
  unit type + quantity, and an actual photo of the paper voucher (stored inline as bytea in
  Postgres, served via `/api/accounts/vouchers/[id]/photo`). Verified: uploaded PNG comes back
  byte-for-byte identical, non-image/oversized files rejected, route requires auth. Needed a real
  schema migration — see `db/migrations/001_voucher_photo_and_units.sql` — now tracked properly
  via `schema_migrations` and applied automatically by `apply-migrations.sh` rather than a manual
  one-off step. Applied to Railway's live database and confirmed working there too, not just local.
- **Fixed a real navigation bug**: all four "Reports" sidebar links (under Inventory, Sales,
  Accounts, Courier) pointed to the identical URL with a hardcoded `active="inventory-reports"`,
  so clicking any of them always highlighted the same sidebar item and opened the same tab,
  regardless of which section you came from. Now each link carries `?tab=X&from=Y` query params;
  the Reports page reads them server-side and passes the right initial tab + correct nav-highlight
  key through. Verified for real: fetched all 4 URLs, confirmed each one server-renders its
  correct tab as visually active AND highlights its own distinct sidebar link — not just "should
  work," actually checked the rendered HTML's styling for both.
- Added a genuine 5th Reports tab, **Courier Summary** (outstanding balance, order/delivered/
  returned counts per courier) — closes a real content gap, since Courier Reports previously had
  no relevant tab to land on at all. Verified the outstanding balance matches the same number
  already cross-checked elsewhere in this project (M&P: Rs 3,632.58).
- Added two more real Reports tabs: **Payable** (per-vendor balance, matches Accounts' Vendor
  Payable KPI: Rs 32,000 verified) and **Expense Breakdown** (by category including Salary,
  matches This Month's Expenses: Rs 34,400 verified). Both the Payable tab and the existing
  Courier/Receivable tab now have real drill-down — clicking a row navigates to that vendor's or
  courier's actual detail page (the same one already built and tested), showing the full ledger
  history that explains how the balance was built up. Not a separate re-implementation of detail
  views — genuinely reuses the same pages.
- **Vendors and Employees now have full CRUD**, not just Create+Read: Edit (name/contact for
  vendors, name/role/salary for employees) and safe Delete. Delete checks for real transaction
  history first — a vendor/employee with any real vouchers against them gets a 409 and a message
  pointing at Disable instead, rather than either silently corrupting the ledger or refusing with
  no explanation. Disable/Enable is a simple status toggle, independent of delete.
  **Real architecture wrinkle handled carefully:** vendors are linked to their vouchers by
  *account name* (`Vendor — {name}`), not a foreign key — so renaming a vendor also renames the
  underlying account, verified for real: renamed a vendor with an actual Rs 32,000 balance,
  confirmed the SAME account row was updated (not duplicated) and the ledger stayed correctly
  linked to the original voucher, with the historical reference text preserved exactly as it was
  at the time of the original purchase. Employees are linked by reference-text matching instead;
  renaming an employee does NOT rewrite past salary voucher references, which is correct
  bookkeeping behavior — a historical record should reflect the name as it was, not be rewritten
  after the fact.
- Accounts ledger rows are now clickable → real View/Edit/Delete on any voucher
  (`/api/accounts/vouchers/[id]`, GET/PATCH/DELETE). Edit supports replacing the photo — verified
  the new upload genuinely overwrites the old one, not just added alongside it. Delete is FK-safe:
  vouchers tied to a courier dispatch/remittance record (referenced by `courier_ledger_entries` or
  `courier_remittance_batches`) are refused with a clear 409 explaining why, rather than corrupting
  the courier ledger's running balance — verified this refusal doesn't leave anything in a partial
  state (the referenced ledger entry is untouched after a blocked delete attempt).

**Import Excel now handles two different file formats**, detected by column name, not by asking
the user which one they have:
- EMS's own round-trip export (`Sale Price`, `Cost Price`, `On Hand`, etc.)
- A **real native Shopify product export** (`Variant Price`, `Cost per item`, `Variant Inventory
  Qty`, etc.) — this needed real handling, not just different column names: Shopify only fills
  Title/Option Names on the *first* row of each multi-variant product, leaving continuation rows
  blank, and sometimes adds pure image-attachment rows with no variant data at all. Both are
  handled correctly (verified against the user's actual real export file, not a synthetic test
  — see `products_export_1.xlsx` in the conversation history if you need a real sample again).
  One known limitation: variant matching on re-import is exact-string-case on option values, so
  a pre-existing "Navy" and a freshly-imported "navy" would be treated as different variants
  (creates a duplicate rather than updating). Not an issue for the user's actual workflow (delete
  everything, then import fresh into an empty table), but worth fixing properly if it comes up.

**NOT yet rebuilt to mockup fidelity** (functional but simplified — built early, before the
"match the mockup exactly" standard was established):
- Accounts, Vendors, Employees, Courier, Customers, Admin
- All 4 Reports sections (Inventory/Sales/Account/Courier Reports)
- Detail pages: Product Detail (partially done), Order Detail, Customer Detail, Courier Detail,
  Voucher Detail

**Recommended next step in a new chat:** continue in this order — Accounts next (it's the
module Vendors/Employees/Reports all hang off of), matching the same process used for
Inventory/Sales: extract real structure from the mockup HTML, rebuild the API + client, verify
with real curl/database checks before calling it done.

## Architecture decisions already made (don't relitigate these without reason)
- **No Docker.** Removed entirely per explicit user request. Runs natively: Postgres via
  Homebrew/Postgres.app, app via `npm run dev` / `npm run start`.
- **Kysely, not Prisma.** Prisma's engine binary download is blocked in the sandbox this was
  built in. Kysely is pure JS, introspects `db/schema.sql` directly via `kysely-codegen`
  (`npm run db:generate-types`) — schema.sql remains the single source of truth.
- **Auth:** bcrypt + JWT in an httpOnly cookie, one seeded Owner user with full access (no
  granular permission-matrix UI yet — deliberately deferred).
- **On-hand inventory can ONLY change via Adjust Stock or the Delivered/Returned order actions**
  — never directly via Edit Variant. This was a deliberate, tested rule (see SRD).
- Returned orders always show Rs 0 profit (items restocked, no sale recognized).

## The user's Mac environment — known quirks, save yourself the debugging loop
- **User's Mac:** 2019 Intel MacBook Pro 16", macOS Tahoe, username `imranjavaid`.
- **Port 5432 is contested** on this Mac — there's a native Postgres process already running
  there (separate from anything we set up). The setup script (`scripts/setup-local.sh`) works
  around this correctly by default now; don't reintroduce Docker or a hardcoded `postgres:postgres`
  connection string, both caused real breakage before.
- **Native Postgres auth on this Mac:** connects as `imranjavaid` (their Mac username) with
  **no password** — this is the working default, confirmed multiple times. `DATABASE_URL` should
  look like `postgresql://imranjavaid@localhost:5432/ems_dev`.
- **`.env` sync has repeatedly been the actual root cause** of "it's not working" reports — more
  often than real bugs. Before debugging app behavior, always first confirm: (a) which folder
  they're actually running from, (b) `.env` has a real `DATABASE_URL`/`JWT_SECRET`, not the
  literal placeholder text, (c) the database was actually re-seeded after a code update
  (`./scripts/setup-local.sh --reset` — NOT just `setup-local.sh`, which skips seeding if the DB
  already has data).
- **Fixed:** resetting the database while already logged in used to crash every dashboard page
  with an unhandled "Error: no result" 500 — the old session cookie's JWT still verified (same
  secret) but pointed at a user ID the reset had just deleted, and 14 pages each did an inline
  `executeTakeFirstOrThrow()` that had no graceful fallback. Now centralized in
  `src/lib/session-user.ts`'s `getSessionUser()`, which redirects to `/login` instead of
  crashing. If you add a new dashboard page, use this helper — don't copy the old inline query
  pattern back in.
- User frequently pastes stale/duplicate screenshots from earlier in a conversation without
  realizing it — if a screenshot looks identical to one already addressed, say so explicitly and
  ask for a fresh one rather than re-diagnosing the same thing twice.
- Ignore `npm audit` warnings (all in dev-only tooling — eslint, exceljs's zip lib). **Never run
  `npm audit fix --force`** — it downgrades Next.js itself and will break the app.
- Occasional dev-mode-only React hydration warnings have appeared and self-heal (React just
  re-renders); if one shows up, check whether it reproduces on a production build
  (`npm run build && npm run start`) before treating it as a real bug — dev-mode Turbopack cache
  corruption after multiple resets is a more likely explanation than a code defect.

## How to verify anything before telling the user it works
Every fix delivered in the previous chat was verified with real `curl` requests against a real
Postgres database (login, fetch real data, check computed numbers by hand) — not just "should
work" from reading the code. Keep doing this. Several real bugs were only caught this way
(a debit/credit sign backwards in a KPI calculation, a `.dockerignore` gap that would've silently
corrupted native modules, a stale sed pattern that silently failed to update `.env`). Assume the
same discipline is required going forward.

## Files worth knowing about
- `db/schema.sql` — the full schema, hand-validated against real Postgres inserts
- `db/migrations/` — there's now an actual tracking mechanism, not just a folder of files: a
  `schema_migrations` table (created by `schema.sql` itself) records which migration files have
  been applied to a given database. `scripts/apply-migrations.sh` reads that table and applies
  only what's missing — safe to run repeatedly, tested for real including idempotency (ran twice,
  second run correctly skipped). Both `setup-local.sh` and `deploy-railway.sh` call it
  automatically now, so this shouldn't need to be remembered manually anymore.
- `scripts/deploy-update.sh` — NEW: run from inside a freshly downloaded/unzipped copy of the
  project (no `.env`, no `.git`) to sync it into the real, already-set-up project folder — tested
  for real with a scratch git repo: confirmed `.env` and `.git` survive untouched, new code lands
  correctly, pending migrations get applied automatically, and it refuses to run against a target
  that doesn't look like a real git-connected project (rather than silently doing the wrong thing).
- `scripts/setup-local.sh` — one-command local setup/reset, native Postgres, no Docker
- `scripts/deploy-local.sh` — apply new code changes locally without touching data (npm install +
  rebuild only)
- `scripts/deploy-railway.sh` — ship changes to Railway: local build check → git commit/push
  (triggers Railway's auto-deploy) → optional schema/reseed against the LIVE database. The
  schema/reseed step links to the Postgres service specifically and uses `DATABASE_PUBLIC_URL` —
  this is a real, hard-won lesson from actually deploying: Railway's `${{Postgres.DATABASE_URL}}`
  reference resolves to an internal-only address that doesn't work from outside Railway's
  network. See the README's Railway section for the full explanation and manual fallback.
- `scripts/seed.ts` + `scripts/mockup-products-data.js` — real seed data extracted from the
  mockup, not hand-typed
- `src/components/app-shell.tsx` — shared sidebar/topbar, colors/fonts pulled directly from the
  mockup's own CSS variables
- `EMS_Software_Requirements_Document.docx`, `EMS_Development_Plan.md`,
  `EMS_Database_Schema.sql` — earlier planning docs, still accurate for architecture/schema,
  though the actual codebase has since surpassed the original 7-day-plan scope in places

## Mobile responsiveness and table sorting

**Sorting** — a reusable client-side hook (`src/lib/use-sortable-table.tsx`) applied to
**every real data column** on every table in the app (not just a subset — verified by counting
sortable headers against the actual column count on each live page after an initial pass that
only covered the "important" columns turned out to be incomplete per direct user feedback):
Inventory (8/8 columns, including computed Profit/unit and Status via added derived fields since
those weren't raw data), Sales & Delivery (10/10), Accounts vouchers ledger (6/6, Details/photo
link correctly excluded — no clean sort value), Vendors (5/5, Actions column correctly excluded),
Employees (5/5), Customers (6/6), Admin Users (6/6), Reports' Payable (3/3)/Receivable (5/5)/
Expense Breakdown tabs, Vendor detail ledger (4/4), Employee detail history (3/3), Courier
detail's Batches/Variance tabs (all columns), and Product detail variants (6/6). Click a column
header to sort ascending, click again for descending; an arrow indicates the active column and
direction.

**Deliberately NOT sortable, by design, not oversight:** the Daily Account Report, Courier
Ledger tab, and the product detail page's Recent Stock Adjustments log. All three show a running
balance or are activity logs where the display order IS the meaning — sorting them by amount
would make the running-balance column nonsensical. Don't add sorting to these without first
deciding what a sorted running balance would even mean.

**A real bug caught before shipping:** the sort hook's file was named `.ts` but contained JSX —
fails to compile. Caught via an actual build, not code review, renamed to `.tsx`.

**Mobile responsiveness:** the sidebar/shell already had genuine mobile handling before this
round (hamburger menu, slide-out sidebar with backdrop, truncating header text) — that wasn't
built this session. What was added: KPI card grids and 2/3-column form-field grids across
Dashboard, Accounts, Inventory, and Reports now stack to a single column below the `sm` breakpoint
instead of staying cramped. Tables themselves rely on horizontal scroll on narrow screens
(pattern already in place from earlier — `overflow-x-auto` wrappers), not a card-based mobile
redesign — this is a deliberate scope decision given the number of tables involved, not
something skipped by accident. If a fully mobile-native table layout (cards instead of horizontal
scroll) is wanted for specific high-traffic tables, that's a larger follow-up, not done here.

## Pagination and search added everywhere

`src/lib/use-pagination.tsx` — a reusable hook, composes with `useSortableTable` (sort first,
paginate the sorted result). Applied to all 7 core list tables: Inventory, Sales & Delivery,
Accounts vouchers, Vendors, Employees, Customers, Admin Users. 5 of these (Accounts, Vendors,
Employees, Customers, Admin Users) had no search at all before this — added. Verified the
pagination slicing math against real data (37 real products → 20+17 across 2 pages, zero overlap,
zero gaps) since the pagination itself only exists client-side and can't be observed in raw SSR
HTML the same way sorting couldn't either.

**Not yet done:** Reports tabs (Payable/Receivable/Expense Breakdown) and the detail-page ledgers
(Vendor/Employee/Courier/Product) don't have pagination or search yet. Lower priority since those
lists are typically small per-entity, but genuinely not finished — don't claim otherwise if asked.

## Shopify Sync — enabled and genuinely tested (Push remains deliberately disabled)

The Inventory page's "Sync with Shopify" button is now real, not just enabled cosmetically —
`/api/inventory/sync-shopify` pulls the store's product list and creates/updates local products.

**Push Updates to Shopify is still disabled on purpose** — that writes to the user's live
production Shopify catalog, and this environment has no network access to `*.myshopify.com` to
test against, so getting it wrong risks real damage to their actual store, not just a sandbox bug.
Sync (read-only from Shopify's perspective) was the safe thing to build and enable first.

**Critical design rule, matching this app's own established on-hand governance**: sync NEVER
overwrites cost price, sale price, or on-hand for a product/variant that already exists locally —
only title, status, and image get refreshed on existing ones. New products/variants get created
with Shopify's price as a starting point and `on_hand: 0`/`cost_price: null` (needs a real Adjust
Stock and manual cost entry, same as any other newly-added item). Matching is by `handle`
(products) and `option1Value`+`option2Value` (variants within a product) — deliberately chosen
because `products.handle` was already unique-per-tenant in the schema, so this needed **no schema
migration** at all.

**How this was actually tested, since I have no real Shopify network access from this sandbox:**
built a local mock HTTP server standing in for Shopify's `products.json` response, temporarily
added a test-only env var override to point the sync route at it, ran the real route end-to-end,
then removed the override before packaging (confirmed removed via grep, then rebuilt clean).
The mock payload deliberately tried to corrupt an existing real variant (Blue Men's Brief,
Navy/2XL — real seed data: cost Rs 172, price Rs 430, on-hand 100) by sending wildly different
fake values (price 999, inventory 9999) — confirmed after sync that the real values were
completely untouched. Also confirmed: a new variant on that same existing product was correctly
created with Shopify's price and null cost; a brand-new product was correctly created from
scratch; running sync a second time was confirmed idempotent (0 products created the second
time, no duplicate variants).

**What this does NOT prove**: that Shopify's real API response shape exactly matches what my mock
assumed, or that the user's real store's actual data will behave identically. **The first real
test is still with the user's live store** — same honesty pattern as every other Shopify feature
in this project. If it fails against the real API, the mismatch is most likely in exactly how
Shopify's real JSON differs from my assumed shape (pagination via the `Link` header for stores
with >250 products isn't implemented at all yet — flagged in the route's own comments).

## Real cash/credit/split accounting, added per user request — no migration needed

**Vendor Purchase now supports Cash / Bank / Credit / Split payment**, not just always-credit like
before. Credit is unchanged (Debit Inventory, Credit Vendor Payable — full amount). Cash/Bank
skips the payable account entirely (Debit Inventory, Credit Cash/Bank — nothing owed). Split
creates two linked vouchers in one transaction: the full purchase as payable, then an immediate
partial payment against it — verified for real: a Rs 10,000 split with Rs 4,000 cash now landed
the vendor's payable at exactly Rs 6,000, not Rs 10,000 or Rs 4,000.

**A real bug this surfaced, not something guessed at:** `nextVoucherNumber` and
`findOrCreateAccount` (`src/lib/accounts-helpers.ts`) always used the outer `db` connection, never
the transaction (`trx`) passed into `db.transaction().execute(...)`. Fine when a route only
inserts one voucher, but the split-payment case inserts two within the same transaction — both
calls to `nextVoucherNumber` read the same stale count (neither could see the other's
not-yet-committed insert), so they generated the same "next" number and collided on the unique
constraint. Fixed by making both helpers accept an optional Kysely connection, defaulting to
`db` but overridable with `trx`. **If you add any future route that inserts more than one voucher
inside a single `db.transaction()`, pass `trx` to these helpers — this is exactly the bug that
will recur otherwise, and it will not show up until two inserts happen in the same transaction.**

**"Record Payment" on the Vendor detail page** — pays down an existing payable *after* the fact,
not just at the moment of purchase (Debit Vendor Payable, Credit Cash/Bank). Tested: a Rs 10,000
payment against a Rs 32,000 balance correctly landed at Rs 22,000.

**"+ Employee Advance/Commission" on Accounts** — an advance increments `employees.advance_balance`
(a column that already existed in the schema, unused until now) and debits a new "Staff Advances"
asset account; a commission is a straight expense and does NOT touch `advance_balance`. Tested
both paths independently to confirm the balance only moves for advances, not commissions.

**"+ Customer Refund" on Accounts** — debits a new "Customer Refunds" expense-type account,
credits Cash/Bank. Verified it correctly shows up as its own line in Reports' Expense Breakdown
tab alongside Salary/Commission/other expense categories, proving it flows through the same real
aggregation, not a separate hardcoded path.

**No schema migration was needed for any of this** — `accounts.type` and `vouchers.voucher_type`
are both plain `text` columns with no CHECK constraint (confirmed by reading schema.sql directly
before assuming), so new values like `"asset"`, `"vendor_payment"`, `"employee_advance"`,
`"commission"`, `"customer_refund"` are just data, not schema changes. `advance_balance` already
existed. Deploying this round is pure code — no `db/migrations/` file, no migration prompt needed.

## Expense voucher now has a real Date field (was hardcoded to "today")

`voucherDate` was hardcoded server-side to `new Date().toISOString().slice(0, 10)` — every Expense
was silently posted as today's date regardless of when the actual expense happened, with no field
in the UI to override it. Fixed on both sides: the route now accepts a real `voucherDate` from the
request (falling back to today only if genuinely not provided), and the modal now has a Date input
matching the same pattern already used on Vendor Purchase. Verified for real: posted an expense
dated 2026-07-01 (a real backdate, not today), confirmed it's stored and returned exactly as
2026-07-01, not silently overwritten — and separately confirmed omitting the date still correctly
falls back to today, so nothing that depended on the old default behavior broke.

## Real bug fixed: voucher photo was wrongly required on edit

Editing a voucher without selecting a new photo was being rejected with "That file doesn't look
like an image" — caused by `if (photo && typeof photo !== "string")` not accounting for the fact
that browsers submit an empty zero-byte `File` object for an untouched file input inside a
submitted form, not `null`. Fixed in both the edit route (`vouchers/[id]/route.ts`) and the create
route (`vendor-purchase/route.ts`, same latent bug, same fix) by adding `photo.size > 0` to the
condition. Verified two ways: (1) reproduced the exact bug by uploading a genuine 0-byte file via
curl, confirmed 200 instead of the rejection, (2) the more important case — created a voucher with
a real photo, edited a different field without touching the photo input at all, confirmed the
original photo survives byte-for-byte, not silently wiped.

## Shopify integration — in progress, credentials layer done, sync itself not started

`Admin` page now has a real "Connect Shopify" flow: store URL + Admin API access token, encrypted
at rest with AES-256-GCM (`src/lib/crypto.ts`, key derived from `JWT_SECRET`) — verified for real
that the token is genuinely unreadable in the database, not just "should be." A "Test Connection"
button calls Shopify's real `shop.json` endpoint to confirm the credentials actually work.

**This could not be tested against a real Shopify store** — no network access to `*.myshopify.com`
from the sandbox this was built in. The storage/encryption/retrieval path was fully tested for
real; the actual live API call was only proven to fail *gracefully* (clean error, not a crash)
against the sandbox's own network restrictions, which is not the same as confirming it works
against a real store. First real test happens live with the user, same pattern as the Railway
deployment.

**Actual product sync (pulling from Shopify) and push (sending price/stock changes to Shopify)
are NOT built yet** — this only covers connecting and verifying credentials. The Inventory page's
Sync/Push buttons stay disabled regardless of connection status until that's built.

### RESOLVED — Test Connection now succeeds against the real store

The 401 issue above is resolved. Confirmed via the user's live screenshot: `aimexa.myshopify.com`,
status "connected", "Connected — Shopify confirmed the store as 'Aimexa'." The root cause was
never definitively pinned down in this chat (most likely theory was `shpss_` vs `shpat_` token
confusion, per the debugging notes below, kept for reference) — the user resolved it independently
between sessions, most likely by using the correct `shpat_` Admin API access token. **Don't assume
the theory below is what actually fixed it** — it's preserved as debugging history, not a
confirmed root cause.

**What this unlocks:** the credentials layer is now proven to work against a real store, not just
in theory. The natural next step is building the actual Sync (pull products from Shopify) and
Push (send price/stock changes to Shopify) functionality — still NOT built as of this note. The
Inventory page's Sync/Push buttons are correctly still disabled (by design, not a bug) since that
work hasn't started. If picking this up, this is now unblocked and ready to build for real against
the user's actual connected store — a first for this feature, everything before now was
built without any way to verify against a live Shopify account.

<details>
<summary>Preserved debugging history from when this was returning 401 (click to expand)</summary>

The credentials/encryption/API-call code has now been exercised against the user's real store
twice, both times returning a genuine `401` from Shopify itself (confirmed via a direct `curl`
outside the app too, bypassing my code entirely — same 401, so **the app's code is very likely
not the bug here**). This is useful signal: 401 means Shopify doesn't recognize the credential at
all (wrong or expired), not a scopes/permissions problem — Shopify would return 403 for a
valid-but-under-scoped token, not 401. Read-only scope is NOT the issue; ruled that out already.

**Most likely cause, not yet confirmed:** the user may have copied Shopify's `shpss_...` **API
secret key** instead of the `shpat_...` **Admin API access token** — these are two different
fields on the same "API credentials" page in a Shopify custom app, easy to conflate, and only the
`shpat_` one authenticates API calls like this. One token the user pasted in chat did start with
`shpss_` before being caught — strong evidence for this theory, though not yet proven since a
correct `shpat_` token hadn't been tested yet as of when this was written.

**Two other domains were tried** (`f0yg1v-9t.myshopify.com` and `aimexa.myshopify.com`) — the
correct one turned out to be `aimexa.myshopify.com`, confirmed by the eventual successful connection.

A token was leaked in the chat during this debugging session and should be treated as
compromised — the user was told to regenerate it in Shopify Admin. (Deliberately not repeating
the leaked value here — GitHub's push protection correctly flagged an earlier version of this
file for containing it literally; don't reintroduce that.)

</details>
