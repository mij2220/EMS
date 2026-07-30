import { db } from "@/db";

export async function findOrCreateAccount(tenantId: string, name: string, type: string) {
  const existing = await db
    .selectFrom("accounts")
    .select("id")
    .where("tenantId", "=", tenantId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (existing) return existing.id;

  const created = await db
    .insertInto("accounts")
    .values({ tenantId, name, type })
    .returning("id")
    .executeTakeFirstOrThrow();
  return created.id;
}

export async function nextVoucherNumber(tenantId: string) {
  const count = await db
    .selectFrom("vouchers")
    .select(({ fn }) => fn.count<string>("id").as("count"))
    .where("tenantId", "=", tenantId)
    .executeTakeFirstOrThrow();
  return `VCH-${(Number(count.count) + 1).toString().padStart(4, "0")}`;
}
