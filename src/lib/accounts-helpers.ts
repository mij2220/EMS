import { db } from "@/db";
import type { Kysely } from "kysely";
import type { DB } from "@/db/types";

// Both helpers default to the shared `db` connection, but accept an explicit
// Kysely instance too — critically, this needs to be the SAME transaction
// object (`trx`) when called from inside a `db.transaction().execute(...)`
// block. Calling these with the outer `db` from inside a transaction is a
// real bug that was caught during testing: the count-based voucher numbering
// can't see a voucher inserted earlier in the same uncommitted transaction,
// so two vouchers created in one transaction would both compute the same
// "next" number and collide on the unique constraint.
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

export async function nextVoucherNumber(tenantId: string, conn: Kysely<DB> = db) {
  const count = await conn
    .selectFrom("vouchers")
    .select(({ fn }) => fn.count<string>("id").as("count"))
    .where("tenantId", "=", tenantId)
    .executeTakeFirstOrThrow();
  return `VCH-${(Number(count.count) + 1).toString().padStart(4, "0")}`;
}
