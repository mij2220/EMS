import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Could not read the form." }, { status: 400 });

  const vendorId = formData.get("vendorId")?.toString();
  const itemDescription = formData.get("itemDescription")?.toString().trim() || "Purchase";
  const amount = Number(formData.get("amount"));
  const voucherDate = formData.get("voucherDate")?.toString() || new Date().toISOString().slice(0, 10);
  const vendorVoucherNumber = formData.get("vendorVoucherNumber")?.toString().trim() || null;
  const unitType = formData.get("unitType")?.toString().trim() || null;
  const totalUnitsRaw = formData.get("totalUnits")?.toString();
  const totalUnits = totalUnitsRaw ? Number(totalUnitsRaw) : null;
  const photo = formData.get("photo");

  // paymentMethod: "credit" (default — full amount added to payable, unchanged
  // from before), "cash" | "bank" (paid in full right now — no payable touched
  // at all), or "split" (part paid now, the rest genuinely still owed).
  const paymentMethod = formData.get("paymentMethod")?.toString() || "credit";
  const cashPaidNowRaw = formData.get("cashPaidNow")?.toString();
  const cashPaidNow = cashPaidNowRaw ? Number(cashPaidNowRaw) : 0;

  if (!vendorId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Vendor and a positive amount are required." }, { status: 400 });
  }
  if (totalUnitsRaw && (totalUnits == null || isNaN(totalUnits) || totalUnits < 0)) {
    return NextResponse.json({ error: "Total units must be a positive number." }, { status: 400 });
  }
  if (!["credit", "cash", "bank", "split"].includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (paymentMethod === "split") {
    if (!cashPaidNowRaw || isNaN(cashPaidNow) || cashPaidNow <= 0 || cashPaidNow >= amount) {
      return NextResponse.json({ error: "For a split payment, the cash paid now must be more than 0 and less than the total amount." }, { status: 400 });
    }
  }

  let photoData: Buffer | null = null;
  let photoMimeType: string | null = null;
  if (photo && typeof photo !== "string" && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large — please keep it under 5MB." }, { status: 400 });
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "That file doesn't look like an image." }, { status: 400 });
    }
    photoData = Buffer.from(await photo.arrayBuffer());
    photoMimeType = photo.type;
  }

  const vendor = await db
    .selectFrom("vendors")
    .select(["id", "name"])
    .where("id", "=", vendorId)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!vendor) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

  const inventoryAccountId = await findOrCreateAccount(session.tenantId, "Inventory", "inventory");
  const payableAccountId = await findOrCreateAccount(session.tenantId, `Vendor — ${vendor.name}`, "payable");

  const result = await db.transaction().execute(async (trx) => {
    if (paymentMethod === "cash" || paymentMethod === "bank") {
      // Paid in full right now — the payable account is never touched at all,
      // since nothing is actually owed after this.
      const cashOrBankAccountId = await findOrCreateAccount(session.tenantId, paymentMethod === "cash" ? "Cash" : "Bank", paymentMethod, trx);
      const voucherNumber = await nextVoucherNumber(session.tenantId, trx);
      const voucher = await trx
        .insertInto("vouchers")
        .values({
          tenantId: session.tenantId,
          voucherNumber,
          voucherType: "vendor_purchase",
          voucherDate,
          debitAccountId: inventoryAccountId,
          creditAccountId: cashOrBankAccountId,
          amount: amount.toString(),
          reference: `${itemDescription} — ${vendor.name} (paid ${paymentMethod})`,
          vendorVoucherNumber,
          unitType,
          totalUnits: totalUnits != null ? totalUnits.toString() : null,
          photoData,
          photoMimeType,
          enteredBy: session.userId,
        })
        .returning(["id", "voucherNumber"])
        .executeTakeFirstOrThrow();
      return [voucher];
    }

    if (paymentMethod === "split") {
      const cashAccountId = await findOrCreateAccount(session.tenantId, "Cash", "cash", trx);
      const purchaseVoucherNumber = await nextVoucherNumber(session.tenantId, trx);
      const purchaseVoucher = await trx
        .insertInto("vouchers")
        .values({
          tenantId: session.tenantId,
          voucherNumber: purchaseVoucherNumber,
          voucherType: "vendor_purchase",
          voucherDate,
          debitAccountId: inventoryAccountId,
          creditAccountId: payableAccountId,
          amount: amount.toString(),
          reference: `${itemDescription} — ${vendor.name} (split: ${cashPaidNow} paid now, ${(amount - cashPaidNow).toFixed(2)} on credit)`,
          vendorVoucherNumber,
          unitType,
          totalUnits: totalUnits != null ? totalUnits.toString() : null,
          photoData,
          photoMimeType,
          enteredBy: session.userId,
        })
        .returning(["id", "voucherNumber"])
        .executeTakeFirstOrThrow();

      const paymentVoucherNumber = await nextVoucherNumber(session.tenantId, trx);
      const paymentVoucher = await trx
        .insertInto("vouchers")
        .values({
          tenantId: session.tenantId,
          voucherNumber: paymentVoucherNumber,
          voucherType: "vendor_payment",
          voucherDate,
          debitAccountId: payableAccountId,
          creditAccountId: cashAccountId,
          amount: cashPaidNow.toString(),
          reference: `Cash paid on purchase ${purchaseVoucher.voucherNumber} — ${vendor.name}`,
          enteredBy: session.userId,
        })
        .returning(["id", "voucherNumber"])
        .executeTakeFirstOrThrow();

      return [purchaseVoucher, paymentVoucher];
    }

    // "credit" — unchanged original behavior: full amount added to payable
    const voucherNumber = await nextVoucherNumber(session.tenantId, trx);
    const voucher = await trx
      .insertInto("vouchers")
      .values({
        tenantId: session.tenantId,
        voucherNumber,
        voucherType: "vendor_purchase",
        voucherDate,
        debitAccountId: inventoryAccountId,
        creditAccountId: payableAccountId,
        amount: amount.toString(),
        reference: `${itemDescription} — ${vendor.name}`,
        vendorVoucherNumber,
        unitType,
        totalUnits: totalUnits != null ? totalUnits.toString() : null,
        photoData,
        photoMimeType,
        enteredBy: session.userId,
      })
      .returning(["id", "voucherNumber"])
      .executeTakeFirstOrThrow();
    return [voucher];
  });

  return NextResponse.json({ ok: true, vouchers: result }, { status: 201 });
}
