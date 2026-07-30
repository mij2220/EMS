import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const couriers = await db.selectFrom("couriers").selectAll().where("tenantId", "=", session.tenantId).orderBy("name").execute();

  const withBalances = await Promise.all(
    couriers.map(async (c) => {
      const accountName = `Courier Receivable — ${c.name}`;
      const row = await db
        .selectFrom("vouchers")
        .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
        .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
        .select(({ fn }) => [
          fn
            .sum<string>(
              sql<number>`case when debit_acct.name = ${accountName} then vouchers.amount when credit_acct.name = ${accountName} then -vouchers.amount else 0 end`
            )
            .as("balance"),
        ])
        .where("vouchers.tenantId", "=", session.tenantId)
        .executeTakeFirst();

      const orderCount = await db
        .selectFrom("orders")
        .select(({ fn }) => fn.count<string>("id").as("count"))
        .where("tenantId", "=", session.tenantId)
        .where("courierId", "=", c.id)
        .executeTakeFirst();

      return {
        ...c,
        commissionPercent: c.commissionPercent != null ? Number(c.commissionPercent) : 0,
        commissionFlat: c.commissionFlat != null ? Number(c.commissionFlat) : 0,
        outstandingBalance: Number(row?.balance ?? 0),
        orderCount: Number(orderCount?.count ?? 0),
      };
    })
  );

  return NextResponse.json({ couriers: withBalances });
}
