import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

async function hasVouchers(tenantId: string, accountName: string) {
  const row = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select("vouchers.id")
    .where("vouchers.tenantId", "=", tenantId)
    .where((eb) => eb.or([eb("debit_acct.name", "=", accountName), eb("credit_acct.name", "=", accountName)]))
    .executeTakeFirst();
  return !!row;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const sub = await db
    .selectFrom("expenseSubcategories")
    .innerJoin("expenseCategories", "expenseCategories.id", "expenseSubcategories.categoryId")
    .select(["expenseSubcategories.id", "expenseSubcategories.name", "expenseSubcategories.categoryId", "expenseCategories.name as categoryName"])
    .where("expenseSubcategories.id", "=", id)
    .where("expenseSubcategories.tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!sub) return NextResponse.json({ error: "Sub-category not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (name === sub.name) return NextResponse.json({ ok: true });

  const clash = await db
    .selectFrom("expenseSubcategories")
    .select("id")
    .where("categoryId", "=", sub.categoryId)
    .where("name", "=", name)
    .where("id", "!=", id)
    .executeTakeFirst();
  if (clash) return NextResponse.json({ error: `"${name}" already exists under "${sub.categoryName}".` }, { status: 409 });

  await db
    .updateTable("accounts")
    .set({ name: `Expense — ${sub.categoryName} — ${name}` })
    .where("tenantId", "=", session.tenantId)
    .where("name", "=", `Expense — ${sub.categoryName} — ${sub.name}`)
    .execute();
  await db.updateTable("expenseSubcategories").set({ name }).where("id", "=", id).execute();

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const sub = await db
    .selectFrom("expenseSubcategories")
    .innerJoin("expenseCategories", "expenseCategories.id", "expenseSubcategories.categoryId")
    .select(["expenseSubcategories.id", "expenseSubcategories.name", "expenseCategories.name as categoryName"])
    .where("expenseSubcategories.id", "=", id)
    .where("expenseSubcategories.tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!sub) return NextResponse.json({ error: "Sub-category not found." }, { status: 404 });

  if (await hasVouchers(session.tenantId, `Expense — ${sub.categoryName} — ${sub.name}`)) {
    return NextResponse.json({ error: `"${sub.name}" has real expense vouchers posted to it and can't be deleted.` }, { status: 409 });
  }

  await db.deleteFrom("expenseSubcategories").where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}
