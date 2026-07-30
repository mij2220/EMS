import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const vouchers = await db
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
      "vouchers.attachmentUrl",
      "debit_acct.name as debitAccountName",
      "credit_acct.name as creditAccountName",
      "users.name as enteredByName",
    ])
    .where("vouchers.tenantId", "=", session.tenantId)
    .orderBy("vouchers.voucherDate", "desc")
    .orderBy("vouchers.createdAt", "desc")
    .execute();

  return NextResponse.json({ vouchers: vouchers.map((v) => ({ ...v, amount: Number(v.amount) })) });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { voucherType, debitAccountId, creditAccountId, amount, reference, voucherDate } = body ?? {};

  if (!voucherType || !debitAccountId || !creditAccountId || !amount) {
    return NextResponse.json({ error: "voucherType, debitAccountId, creditAccountId and amount are required." }, { status: 400 });
  }
  if (debitAccountId === creditAccountId) {
    return NextResponse.json({ error: "Debit and credit accounts must be different." }, { status: 400 });
  }

  // Both accounts must belong to this tenant — prevents posting against another tenant's account
  const accounts = await db
    .selectFrom("accounts")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("id", "in", [debitAccountId, creditAccountId])
    .execute();
  if (accounts.length !== 2) return NextResponse.json({ error: "One or both accounts were not found." }, { status: 404 });

  const count = await db
    .selectFrom("vouchers")
    .select(({ fn }) => fn.count<string>("id").as("count"))
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirstOrThrow();
  const voucherNumber = `VCH-${(Number(count.count) + 1).toString().padStart(4, "0")}`;

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType,
      voucherDate: voucherDate || new Date().toISOString().slice(0, 10),
      debitAccountId,
      creditAccountId,
      amount: Number(amount).toString(),
      reference: reference || null,
      enteredBy: session.userId,
    })
    .returning(["id", "voucherNumber"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
