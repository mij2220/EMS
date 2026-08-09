import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const vendor = await db
    .selectFrom("vendors")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!vendor) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount);
  const paidFrom = body?.paidFrom === "Bank" ? "Bank" : "Cash";

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "A positive amount is required." }, { status: 400 });
  }

  const payableAccountId = await findOrCreateAccount(session.tenantId, `Vendor — ${vendor.name}`, "payable");
  const cashOrBankAccountId = await findOrCreateAccount(session.tenantId, paidFrom, paidFrom === "Cash" ? "cash" : "bank");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "vendor_payment",
      voucherDate: new Date().toISOString().slice(0, 10),
      debitAccountId: payableAccountId,
      creditAccountId: cashOrBankAccountId,
      amount: amount.toString(),
      reference: `Payment to ${vendor.name}`,
      enteredBy: session.userId,
    })
    .returning(["id", "voucherNumber"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
