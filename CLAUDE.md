# EMS (Aimexa Store) — Project Context for a New Chat

Read this first. This project has a long build history in a previous chat that got unwieldy —
this file exists so a fresh conversation can pick up accurately without re-deriving everything.

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

### Live debugging in progress — Shopify Test Connection returning 401

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
correct `shpat_` token hasn't been tested yet (the curl attempt with it failed on a shell syntax
issue — multi-line backslash continuation broke in zsh with blank lines in between — not
re-attempted successfully as of this note).

**Two other domains have been tried** (`f0yg1v-9t.myshopify.com` and `aimexa.myshopify.com`) —
worth confirming which one is actually correct by having the user check Settings → Domains or the
browser URL while logged into `admin.shopify.com` directly, rather than guessing.

**Next step if picking this up fresh:** ask the user to look at their Shopify app's API
credentials page and describe exactly what fields/labels are there (or send a screenshot with the
actual secret values still masked/hidden), to confirm which credential is the right one before
trying again. A token was leaked in the chat during this debugging session and should be treated
as compromised — the user was told to regenerate it in Shopify Admin; unconfirmed whether they
have yet. (Deliberately not repeating the leaked value here — GitHub's push protection correctly
flagged an earlier version of this file for containing it literally; don't reintroduce that.)
