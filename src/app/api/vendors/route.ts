import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const vendors = await db.selectFrom("vendors").selectAll().where("tenantId", "=", session.tenantId).orderBy("name").execute();

  const withBalances = await Promise.all(
    vendors.map(async (v) => {
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
          fn.max<string>(sql<string>`case when credit_acct.name = ${accountName} or debit_acct.name = ${accountName} then vouchers.voucher_date::text end`).as("lastActivity"),
        ])
        .where("vouchers.tenantId", "=", session.tenantId)
        .executeTakeFirst();

      return { ...v, payableBalance: Number(row?.balance ?? 0), lastActivity: row?.lastActivity ?? null };
    })
  );

  return NextResponse.json({ vendors: withBalances });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });

  const vendor = await db
    .insertInto("vendors")
    .values({ tenantId: session.tenantId, name, contact: body?.contact?.trim() || null })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, vendorId: vendor.id }, { status: 201 });
}
