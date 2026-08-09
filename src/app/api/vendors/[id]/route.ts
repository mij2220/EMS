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

export async function PATCH(req: NextRequest, { params }: Params) {
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

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const contact = body?.contact;
  const status = body?.status;

  if (status && status !== "active" && status !== "inactive") {
    return NextResponse.json({ error: 'Status must be "active" or "inactive".' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (contact !== undefined) updates.contact = contact?.trim() || null;
  if (status) updates.status = status;

  // Renaming a vendor also renames its ledger account, so past AND future
  // purchases/payments stay linked to the same running balance — without
  // this, the old account name would go orphaned and a brand new "Vendor —
  // NewName" account would silently start from zero.
  if (name && name !== vendor.name) {
    const oldAccountName = `Vendor — ${vendor.name}`;
    const newAccountName = `Vendor — ${name}`;
    await db
      .updateTable("accounts")
      .set({ name: newAccountName })
      .where("tenantId", "=", session.tenantId)
      .where("name", "=", oldAccountName)
      .execute();
    updates.name = name;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.updateTable("vendors").set(updates).where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
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

  const accountName = `Vendor — ${vendor.name}`;
  const hasTransactions = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select("vouchers.id")
    .where("vouchers.tenantId", "=", session.tenantId)
    .where((eb) => eb.or([eb("debit_acct.name", "=", accountName), eb("credit_acct.name", "=", accountName)]))
    .executeTakeFirst();

  if (hasTransactions) {
    return NextResponse.json(
      { error: `${vendor.name} has real purchase/payment history and can't be deleted — use "Disable" instead to stop new transactions without losing the record.` },
      { status: 409 }
    );
  }

  await db.deleteFrom("vendors").where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}
