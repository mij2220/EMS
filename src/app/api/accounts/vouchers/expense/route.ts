import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const category = body?.category?.trim();
  const amount = Number(body?.amount);
  const paidFrom = body?.paidFrom === "Bank" ? "Bank" : "Cash";
  const description = body?.description?.trim() || category;

  if (!category || !amount || amount <= 0) {
    return NextResponse.json({ error: "category and a positive amount are required." }, { status: 400 });
  }

  const debitAccountId = await findOrCreateAccount(session.tenantId, `Expense — ${category}`, "expense");
  const creditAccountId = await findOrCreateAccount(session.tenantId, paidFrom, paidFrom === "Cash" ? "cash" : "bank");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "expense",
      voucherDate: new Date().toISOString().slice(0, 10),
      debitAccountId,
      creditAccountId,
      amount: amount.toString(),
      reference: description,
      enteredBy: session.userId,
    })
    .returning(["id", "voucherNumber"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
