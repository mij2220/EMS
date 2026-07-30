import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const vendorId = body?.vendorId;
  const itemDescription = body?.itemDescription?.trim() || "Purchase";
  const amount = Number(body?.amount);

  if (!vendorId || !amount || amount <= 0) {
    return NextResponse.json({ error: "vendorId and a positive amount are required." }, { status: 400 });
  }

  const vendor = await db
    .selectFrom("vendors")
    .select(["id", "name"])
    .where("id", "=", vendorId)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!vendor) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

  const debitAccountId = await findOrCreateAccount(session.tenantId, "Inventory", "inventory");
  const creditAccountId = await findOrCreateAccount(session.tenantId, `Vendor — ${vendor.name}`, "payable");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "vendor_purchase",
      voucherDate: new Date().toISOString().slice(0, 10),
      debitAccountId,
      creditAccountId,
      amount: amount.toString(),
      reference: `${itemDescription} — ${vendor.name}`,
      enteredBy: session.userId,
    })
    .returning(["id", "voucherNumber"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
