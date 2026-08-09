import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const customerId = body?.customerId;
  const reason = body?.reason?.trim() || "Refund";
  const amount = Number(body?.amount);
  const paidFrom = body?.paidFrom === "Bank" ? "Bank" : "Cash";

  if (!customerId || !amount || amount <= 0) {
    return NextResponse.json({ error: "customerId and a positive amount are required." }, { status: 400 });
  }

  const customer = await db
    .selectFrom("customers")
    .select(["id", "name"])
    .where("id", "=", customerId)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  // A contra-revenue account — reduces net sales in effect, distinct from a
  // regular operating expense, even though this app's simplified P&L doesn't
  // yet break "net of returns" out as its own line (see Reports' P&L tab,
  // which nets returned ORDERS to zero profit already — this covers refunds
  // issued for other reasons, like a delivered-but-defective item, that
  // don't go through the order-return flow at all).
  const debitAccountId = await findOrCreateAccount(session.tenantId, "Customer Refunds", "expense");
  const creditAccountId = await findOrCreateAccount(session.tenantId, paidFrom, paidFrom === "Cash" ? "cash" : "bank");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "customer_refund",
      voucherDate: new Date().toISOString().slice(0, 10),
      debitAccountId,
      creditAccountId,
      amount: amount.toString(),
      reference: `${customer.name} — ${reason}`,
      enteredBy: session.userId,
    })
    .returning(["id", "voucherNumber"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
