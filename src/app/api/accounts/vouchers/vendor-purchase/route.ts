import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB — generous for a phone photo of a paper voucher, small enough not to bloat the database

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

  if (!vendorId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Vendor and a positive amount are required." }, { status: 400 });
  }
  if (totalUnitsRaw && (totalUnits == null || isNaN(totalUnits) || totalUnits < 0)) {
    return NextResponse.json({ error: "Total units must be a positive number." }, { status: 400 });
  }

  let photoData: Buffer | null = null;
  let photoMimeType: string | null = null;
  if (photo && typeof photo !== "string") {
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

  const debitAccountId = await findOrCreateAccount(session.tenantId, "Inventory", "inventory");
  const creditAccountId = await findOrCreateAccount(session.tenantId, `Vendor — ${vendor.name}`, "payable");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "vendor_purchase",
      voucherDate,
      debitAccountId,
      creditAccountId,
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

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
