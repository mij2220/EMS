import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const courier = await db
    .selectFrom("couriers")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!courier) return NextResponse.json({ error: "Courier not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount);
  const batchNumber = body?.batchNumber?.trim();
  if (!amount || amount <= 0 || !batchNumber) {
    return NextResponse.json({ error: "batchNumber and a positive amount are required." }, { status: 400 });
  }

  const cashAccountId = await findOrCreateAccount(session.tenantId, "Cash", "cash");
  const receivableAccountId = await findOrCreateAccount(session.tenantId, `Courier Receivable — ${courier.name}`, "receivable");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const result = await db.transaction().execute(async (trx) => {
    const voucher = await trx
      .insertInto("vouchers")
      .values({
        tenantId: session.tenantId,
        voucherNumber,
        voucherType: "cash_receipt",
        voucherDate: new Date().toISOString().slice(0, 10),
        debitAccountId: cashAccountId,
        creditAccountId: receivableAccountId,
        amount: amount.toString(),
        reference: `${courier.name} remittance batch #${batchNumber}`,
        enteredBy: session.userId,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    // Running balance: previous balance minus this remittance
    const prev = await trx
      .selectFrom("courierLedgerEntries")
      .select("balanceAfter")
      .where("courierId", "=", id)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst();
    const newBalance = Number(prev?.balanceAfter ?? 0) - amount;

    await trx
      .insertInto("courierLedgerEntries")
      .values({
        tenantId: session.tenantId,
        courierId: id,
        entryType: "remittance_debit",
        amount: amount.toString(),
        balanceAfter: newBalance.toString(),
        voucherId: voucher.id,
      })
      .execute();

    const batch = await trx
      .insertInto("courierRemittanceBatches")
      .values({ tenantId: session.tenantId, courierId: id, batchNumber, amount: amount.toString(), voucherId: voucher.id, status: "posted" })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    return { voucherId: voucher.id, batchId: batch.id };
  });

  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
