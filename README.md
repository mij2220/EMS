# EMS — Complete Build

Login + Inventory + Sales & Delivery + Accounts + Vendors + Employees + Courier + Customers + Reports +
Admin, all wired to a real PostgreSQL database with real seeded Aimexa Store data — matching
`EMS_UI_UX_Mockup.html` and `schema.sql`.

Everything below has been run and verified in a sandboxed Linux environment before being handed to you,
including a full end-to-end run of the exact setup script below (database creation, schema, seed, and a
real login) using a Postgres role with no password — matching how Postgres.app and Homebrew set things up
on a Mac by default.

**No Docker.** The app runs directly on your Mac with `npm run dev`, and Postgres runs directly on your
Mac too (via Homebrew or Postgres.app) — no containers involved.

---

## Where's the backend?

There isn't a separate backend folder — this is a **Next.js** app, where API routes live *inside* the
same project, under `src/app/api/`. Every file there named `route.ts` is a real backend endpoint: it
handles its own database queries (via Kysely, see `src/db/`), its own auth check, its own business logic.
Nothing about it is "frontend code that happens to touch a database" — it's genuinely server-side code,
compiled separately from the browser bundle, that only Next.js's build process happens to organize inside
the same folder tree as the pages that call it. One codebase, one `npm install`, one deploy — not two
separate projects to keep in sync.

For example, `src/app/api/sales/orders/[id]/deliver/route.ts` is the entire backend logic for "Mark
Delivered" — it checks the session, validates the order, and runs a real SQL transaction that deducts
inventory. There are 30 of these across the app; run this to see all of them:
```bash
find src/app/api -name "route.ts"
```

---

## 1. One-time setup on your Mac

### Node
```bash
node --version
```
Need **Node 20+**. If not:
```bash
nvm install 20 && nvm use 20
```

### PostgreSQL
If you don't already have Postgres installed:
```bash
brew install postgresql@16
brew services start postgresql@16
```
Or install [Postgres.app](https://postgresapp.com/) instead, and start it from Applications.

If you already have Postgres running from earlier (which you do — we found it on port 5432 during
setup), you don't need to install anything new; the script below will detect and use it.

---

## 2. Get the app running

### Quick start
```bash
cd ems-app
./scripts/setup-local.sh
npm run dev
```
This one script does everything: checks Node/Postgres, creates the `ems_dev` database if it doesn't
exist, creates `.env` with a real random `JWT_SECRET` and an auto-detected `DATABASE_URL`, applies the
schema, installs dependencies, and seeds real data. Safe to re-run any time.

```bash
./scripts/setup-local.sh --reset   # wipe and re-seed an existing database
```

Open **http://localhost:3000** — log in with `owner@aimexa.store` / `ChangeMe123!` (or whatever
`SEED_OWNER_PASSWORD` is set to in `.env`).

### If the script can't auto-detect your connection
The script assumes the common Mac default: a Postgres role matching your Mac username, no password. If
your setup is different (a password-protected role, a non-default port), the script will fail clearly at
that step and tell you to set `DATABASE_URL` in `.env` by hand — see the comments in `.env.example` for
the exact format, then re-run the script; it'll skip straight past that check once `.env` already has a
working connection string.

### Manual steps (what the script does, if you want to run them by hand)
```bash
npm install
createdb ems_dev                                    # skip if it already exists
cp .env.example .env
# edit .env: set JWT_SECRET (openssl rand -base64 32) and DATABASE_URL
psql "$DATABASE_URL" -f db/schema.sql                # skip if tables already exist
npm run seed
npm run dev
```

### Resetting your database
```bash
./scripts/setup-local.sh --reset
```
or manually:
```bash
psql "$DATABASE_URL" -c "TRUNCATE tenants CASCADE;"
npm run seed
```

---

## 3. Deploying to Railway (you already have GitHub + Railway set up)

### Quick start
```bash
npm install -g @railway/cli   # if you don't have it yet
git add . && git commit -m "Deploy" && git push
./scripts/deploy-railway.sh
```

**Please read this before running it:** `deploy-railway.sh` was written carefully against Railway's
documented CLI, but — unlike the local setup script above, which was fully tested end-to-end — it could
**not** be tested against a real Railway account, because the environment this was built in has no
network access to railway.app. Run it a step at a time the first time (paste the commands one at a time
into your terminal instead of running the whole file blind), and if any command's flags don't match your
installed `railway` CLI, run `railway <command> --help` to check current syntax.

### What it does, in order
1. Checks the Railway CLI is installed
2. Logs you in (opens a browser)
3. Links this folder to a Railway project (or creates one)
4. Adds a PostgreSQL plugin
5. Sets `JWT_SECRET` (a fresh one, different from your local `.env`) and wires `DATABASE_URL` to the
   Postgres plugin using Railway's reference-variable syntax
6. Deploys (`railway up`)
7. Applies `db/schema.sql` to the deployed database
8. Asks whether to seed the deployed database with the real demo data, then prints your live URL

### Manual steps (if you'd rather do it by hand)
1. New Project → Deploy from GitHub repo → select this repo.
2. Add a plugin: **PostgreSQL**.
3. On your app service → Variables tab: `DATABASE_URL` → "Add Reference" → the Postgres plugin's
   `DATABASE_URL`; `JWT_SECRET` → paste the output of `openssl rand -base64 32`.
4. Railway auto-detects Next.js — no extra config needed.
5. Apply schema + seed:
   ```bash
   railway run bash -c 'psql "$DATABASE_URL" < db/schema.sql'
   railway run node --import tsx scripts/seed.ts
   ```
6. Visit the Railway-provided URL.

Note: Railway's own infrastructure uses containers behind the scenes to run your build — that's Railway's
concern, not something that happens on your Mac. Nothing here requires Docker to be installed locally.

**Recommended going forward:** keep a `staging` environment that auto-deploys on every push, and only
promote to production once you've clicked through it — per `EMS_Development_Plan.md`.

---

## 4. What's real vs. what's next

**Visual design:** every screen uses a shared `AppShell` component (`src/components/app-shell.tsx`) built
directly from `EMS_UI_UX_Mockup.html`'s actual colors, fonts, and sidebar structure.

**Real and tested — every flow below was verified against the real database, not just code-reviewed:**

- **Auth:** login, logout, session check, every page and every API route independently checks the session
- **Dashboard:** real KPI cards (Today's Sales, Cash, Courier Receivable, Low Stock), computed live
- **Inventory:** the full real catalog — all 37 products, 133 variants, seeded directly from
  `EMS_UI_UX_Mockup-14.html`'s own data (not a cut-down subset), with real photos (24/37 fetched from
  aimexa.store), real cost/price/profit-per-unit, and the real SKU-missing count (37/37) — matching the
  finalized mockup screen exactly, not an approximation. Product list/detail, Add/Edit/Delete Product &
  Variant, Adjust Stock (reason-coded,
  transactional, overdraft-guarded — on-hand can ONLY change through this, never through Edit Variant),
  Excel export, recent-adjustments log
- **Sales & Delivery:** order list/detail with the real Sale Status pipeline. "Mark Delivered" and "Mark
  Returned" are real transactions — verified by hand: delivering deducts real stock, returning a delivered
  order restocks it, returning a never-delivered order changes nothing (all three paths individually tested)
- **Accounts:** real KPIs (Cash, Vendor Payable, Courier Receivable, Month's Expenses), Add Expense/Salary/
  Vendor Purchase/generic New Voucher — each tested with a real write, confirming the KPIs actually move
- **Vendors & Employees:** real master data with real ledgers (derived from vouchers, never a
  separately-stored balance that could drift out of sync)
- **Courier:** real per-courier balances, ledger with correct running balance at every step, remittance
  batches, COD variance — "Record Remittance" tested for real, confirmed it updates the ledger **and**
  shows up in the shared Accounts voucher list (same underlying data, not a duplicate)
- **Customers:** real list with order count, lifetime value, and return count per customer
- **Reports:** Stock Valuation, Sales Summary, Profit & Loss, and a Daily Account Report (day book) — all
  computed live. The Daily Account Report's final running balance is cross-checked against the Accounts
  Cash KPI and confirmed to match exactly
- **Admin:** real Users list (name, role, 2FA status, last login)
- A production build (`npm run build` / `npm run start`) verified working, 30 API routes, zero build errors

**Not yet built / explicitly deferred (see `EMS_Development_Plan.md` and SRD Section 15):**
- The manual PDF-import flow for orders (button is present but disabled with an explanatory tooltip)
- The granular permission-matrix editor UI (seed gives Owner full access directly)
- Company/tenant settings, integration credentials UI, audit log UI, notification settings
- Shopify/WooCommerce sync, courier APIs beyond M&P, 2FA, multi-tenant signup

---

## 5. A note on the tech stack vs. the original plan

The development plan recommended **Prisma** as the ORM. Prisma needs to download compiled engine
binaries at install time, and that download is blocked in the sandboxed environment this was built and
tested in — so this build uses **Kysely** instead: a type-safe SQL query builder that's pure JavaScript,
no native binaries, no download step. It reads `schema.sql` by directly introspecting a live database
(`npx kysely-codegen`), so there's no separate schema definition to keep in sync — `schema.sql` remains
the single source of truth.
