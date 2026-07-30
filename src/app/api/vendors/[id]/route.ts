import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const vendor = await db
    .selectFrom("vendors")
    .selectAll()
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!vendor) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

  const accountName = `Vendor — ${vendor.name}`;
  const ledger = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select([
      "vouchers.id",
      "vouchers.voucherNumber",
      "vouchers.voucherDate",
      "vouchers.amount",
      "vouchers.reference",
      "debit_acct.name as debitAccountName",
      "credit_acct.name as creditAccountName",
    ])
    .where("vouchers.tenantId", "=", session.tenantId)
    .where((eb) => eb.or([eb("debit_acct.name", "=", accountName), eb("credit_acct.name", "=", accountName)]))
    .orderBy("vouchers.voucherDate", "desc")
    .execute();

  return NextResponse.json({
    vendor,
    ledger: ledger.map((l) => ({
      ...l,
      amount: Number(l.amount),
      direction: l.creditAccountName === accountName ? "purchase" : "payment",
    })),
  });
}
