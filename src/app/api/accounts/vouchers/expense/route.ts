import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const categoryId = body?.categoryId;
  const subcategoryId = body?.subcategoryId || null;
  const amount = Number(body?.amount);
  const paidFrom = body?.paidFrom === "Bank" ? "Bank" : "Cash";
  const voucherDate = body?.voucherDate || new Date().toISOString().slice(0, 10);

  if (!categoryId || !amount || amount <= 0) {
    return NextResponse.json({ error: "categoryId and a positive amount are required." }, { status: 400 });
  }

  const category = await db
    .selectFrom("expenseCategories")
    .select(["id", "name"])
    .where("id", "=", categoryId)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  let accountName = `Expense — ${category.name}`;
  let subcategoryName: string | null = null;
  if (subcategoryId) {
    const sub = await db
      .selectFrom("expenseSubcategories")
      .select(["id", "name"])
      .where("id", "=", subcategoryId)
      .where("categoryId", "=", categoryId)
      .where("tenantId", "=", session.tenantId)
      .executeTakeFirst();
    if (!sub) return NextResponse.json({ error: "Sub-category not found under that category." }, { status: 404 });
    accountName = `Expense — ${category.name} — ${sub.name}`;
    subcategoryName = sub.name;
  }

  const description = body?.description?.trim() || subcategoryName || category.name;

  const debitAccountId = await findOrCreateAccount(session.tenantId, accountName, "expense");
  const creditAccountId = await findOrCreateAccount(session.tenantId, paidFrom, paidFrom === "Cash" ? "cash" : "bank");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "expense",
      voucherDate,
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
