import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";
import { buildXlsxResponse } from "@/lib/xlsx-export";

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
      return { name: c.name, contact: c.contact, mode: c.mode, remittanceCycleDays: c.remittanceCycleDays, balance: Number(row?.balance ?? 0) };
    })
  );

  return buildXlsxResponse(
    "Couriers",
    [
      { header: "Name", key: "name", width: 22 },
      { header: "Contact", key: "contact", width: 18 },
      { header: "Mode", key: "mode", width: 12 },
      { header: "Remittance Cycle (days)", key: "remittanceCycleDays", width: 20 },
      { header: "Balance", key: "balance", width: 14 },
    ],
    withBalances,
    "couriers-export"
  );
}
