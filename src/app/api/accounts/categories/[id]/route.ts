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

  const category = await db
    .selectFrom("expenseCategories")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const status = body?.status;

  if (status !== undefined) {
    if (status !== "active" && status !== "inactive") {
      return NextResponse.json({ error: 'Status must be "active" or "inactive".' }, { status: 400 });
    }
    await db.updateTable("expenseCategories").set({ status }).where("id", "=", id).execute();
    if (!name) return NextResponse.json({ ok: true });
  }

  if (!name) return NextResponse.json({ ok: true });
  if (name === category.name) return NextResponse.json({ ok: true });

  const clash = await db
    .selectFrom("expenseCategories")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("name", "=", name)
    .where("id", "!=", id)
    .executeTakeFirst();
  if (clash) return NextResponse.json({ error: `"${name}" already exists.` }, { status: 409 });

  const subcategories = await db
    .selectFrom("expenseSubcategories")
    .select(["id", "name"])
    .where("categoryId", "=", id)
    .execute();

  await db.transaction().execute(async (trx) => {
    // Rename the category's own account, if one has ever been used
    await trx
      .updateTable("accounts")
      .set({ name: `Expense — ${name}` })
      .where("tenantId", "=", session.tenantId)
      .where("name", "=", `Expense — ${category.name}`)
      .execute();

    // Rename every sub-category's account too, so their vouchers stay linked
    for (const sub of subcategories) {
      await trx
        .updateTable("accounts")
        .set({ name: `Expense — ${name} — ${sub.name}` })
        .where("tenantId", "=", session.tenantId)
        .where("name", "=", `Expense — ${category.name} — ${sub.name}`)
        .execute();
    }

    await trx.updateTable("expenseCategories").set({ name }).where("id", "=", id).execute();
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const category = await db
    .selectFrom("expenseCategories")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  const subcategories = await db
    .selectFrom("expenseSubcategories")
    .select(["name"])
    .where("categoryId", "=", id)
    .execute();

  if (await hasVouchers(session.tenantId, `Expense — ${category.name}`)) {
    return NextResponse.json({ error: `"${category.name}" has real expense vouchers posted directly to it and can't be deleted.` }, { status: 409 });
  }
  for (const sub of subcategories) {
    if (await hasVouchers(session.tenantId, `Expense — ${category.name} — ${sub.name}`)) {
      return NextResponse.json(
        { error: `Sub-category "${sub.name}" under "${category.name}" has real expense vouchers and can't be deleted — delete or reassign those first.` },
        { status: 409 }
      );
    }
  }

  // Safe: nothing under this category (or its sub-categories) is in use —
  // the DB's own on-delete-cascade handles removing the sub-category rows.
  await db.deleteFrom("expenseCategories").where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}
