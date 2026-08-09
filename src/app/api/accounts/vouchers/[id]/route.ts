import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const voucher = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .innerJoin("users", "users.id", "vouchers.enteredBy")
    .select([
      "vouchers.id",
      "vouchers.voucherNumber",
      "vouchers.voucherType",
      "vouchers.voucherDate",
      "vouchers.amount",
      "vouchers.reference",
      "vouchers.vendorVoucherNumber",
      "vouchers.unitType",
      "vouchers.totalUnits",
      "vouchers.createdAt",
      "debit_acct.name as debitAccountName",
      "credit_acct.name as creditAccountName",
      "users.name as enteredByName",
    ])
    .where("vouchers.id", "=", id)
    .where("vouchers.tenantId", "=", session.tenantId)
    .executeTakeFirst();

  if (!voucher) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });

  const photoCheck = await db
    .selectFrom("vouchers")
    .select(({ eb }) => eb("photoData", "is not", null).as("hasPhoto"))
    .where("id", "=", id)
    .executeTakeFirst();

  return NextResponse.json({
    voucher: {
      ...voucher,
      amount: Number(voucher.amount),
      totalUnits: voucher.totalUnits != null ? Number(voucher.totalUnits) : null,
      hasPhoto: !!photoCheck?.hasPhoto,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const existing = await db
    .selectFrom("vouchers")
    .select("id")
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!existing) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Could not read the form." }, { status: 400 });

  const voucherDate = formData.get("voucherDate")?.toString();
  const reference = formData.get("reference")?.toString().trim();
  const vendorVoucherNumber = formData.get("vendorVoucherNumber")?.toString().trim();
  const unitType = formData.get("unitType")?.toString().trim();
  const totalUnitsRaw = formData.get("totalUnits")?.toString();
  const amountRaw = formData.get("amount")?.toString();
  const photo = formData.get("photo");

  const amount = amountRaw ? Number(amountRaw) : null;
  if (amountRaw && (amount == null || isNaN(amount) || amount <= 0)) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }
  const totalUnits = totalUnitsRaw ? Number(totalUnitsRaw) : null;
  if (totalUnitsRaw && (totalUnits == null || isNaN(totalUnits) || totalUnits < 0)) {
    return NextResponse.json({ error: "Total units must be a positive number." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (voucherDate) updates.voucherDate = voucherDate;
  if (reference !== undefined) updates.reference = reference || null;
  if (vendorVoucherNumber !== undefined) updates.vendorVoucherNumber = vendorVoucherNumber || null;
  if (unitType !== undefined) updates.unitType = unitType || null;
  if (totalUnitsRaw !== undefined) updates.totalUnits = totalUnits != null ? totalUnits.toString() : null;
  if (amount != null) updates.amount = amount.toString();

  if (photo && typeof photo !== "string" && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large — please keep it under 5MB." }, { status: 400 });
    }
    if (!photo.type.startsWith("image/")) {
      return NextResponse.json({ error: "That file doesn't look like an image." }, { status: 400 });
    }
    updates.photoData = Buffer.from(await photo.arrayBuffer());
    updates.photoMimeType = photo.type;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.updateTable("vouchers").set(updates).where("id", "=", id).execute();

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const existing = await db
    .selectFrom("vouchers")
    .select("id")
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!existing) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });

  try {
    await db.deleteFrom("vouchers").where("id", "=", id).execute();
  } catch {
    // A courier ledger entry or remittance batch references this voucher —
    // deleting it would silently break that running-balance chain, so this
    // is refused rather than allowed to corrupt the courier ledger.
    return NextResponse.json(
      { error: "This voucher is tied to a courier dispatch or remittance record and can't be deleted directly — it's part of the courier ledger's running balance." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
