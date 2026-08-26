import { db } from "@/db";
import type { Kysely } from "kysely";
import type { DB } from "@/db/types";

// Both helpers default to the shared `db` connection, but accept an explicit
// Kysely instance too — needs to be the SAME transaction object (`trx`) when
// called from inside a `db.transaction().execute(...)` block, so multiple
// calls within one transaction see each other's not-yet-committed writes.
export async function findOrCreateAccount(tenantId: string, name: string, type: string, conn: Kysely<DB> = db) {
  const existing = await conn
    .selectFrom("accounts")
    .select("id")
    .where("tenantId", "=", tenantId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (existing) return existing.id;

  const created = await conn
    .insertInto("accounts")
    .values({ tenantId, name, type })
    .returning("id")
    .executeTakeFirstOrThrow();
  return created.id;
}

// Generates the next voucher number atomically via a dedicated per-tenant
// counter table (voucher_counters). The stored value is "the last number
// used" for that tenant. A single INSERT ... ON CONFLICT DO UPDATE ...
// RETURNING statement either creates the row at 1 (first voucher ever for
// this tenant) or increments the existing row and returns the new value —
// Postgres guarantees this whole operation is safe under concurrent access
// via row-level locking, so two simultaneous requests can never be handed
// the same number. This replaced a "SELECT count(*)+1" approach that was
// provably unsafe: it caused a real production incident (duplicate key
// violation on VCH-0044, 2026-08-26) the moment two voucher creations
// happened close together. Do not go back to a count-based approach here —
// it will reintroduce exactly that bug.
export async function nextVoucherNumber(tenantId: string, conn: Kysely<DB> = db) {
  const result = await conn
    .insertInto("voucherCounters")
    .values({ tenantId, nextNumber: 1 })
    .onConflict((oc) => oc.column("tenantId").doUpdateSet((eb) => ({ nextNumber: eb("voucherCounters.nextNumber", "+", 1) })))
    .returning("nextNumber")
    .executeTakeFirstOrThrow();

  return `VCH-${result.nextNumber.toString().padStart(4, "0")}`;
}
