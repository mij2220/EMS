import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";
import { buildXlsxResponse } from "@/lib/xlsx-export";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const vendors = await db.selectFrom("vendors").selectAll().where("tenantId", "=", session.tenantId).orderBy("name").execute();
  const filtered = q
    ? vendors.filter((v) => v.name.toLowerCase().includes(q) || (v.contact ?? "").toLowerCase().includes(q))
    : vendors;

  const withBalances = await Promise.all(
    filtered.map(async (v) => {
      const accountName = `Vendor — ${v.name}`;
      const row = await db
        .selectFrom("vouchers")
        .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
        .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
        .select(({ fn }) => [
          fn
            .sum<string>(
              sql<number>`case when credit_acct.name = ${accountName} then vouchers.amount when debit_acct.name = ${accountName} then -vouchers.amount else 0 end`
            )
            .as("balance"),
        ])
        .where("vouchers.tenantId", "=", session.tenantId)
        .executeTakeFirst();
      return { name: v.name, contact: v.contact, payableBalance: Number(row?.balance ?? 0) };
    })
  );

  return buildXlsxResponse(
    "Vendors",
    [
      { header: "Name", key: "name", width: 24 },
      { header: "Contact", key: "contact", width: 20 },
      { header: "Payable Balance", key: "payableBalance", width: 16 },
    ],
    withBalances,
    "vendors-export"
  );
}
