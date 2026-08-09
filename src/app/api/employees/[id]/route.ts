import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const employee = await db
    .selectFrom("employees")
    .selectAll()
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const history = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .select(["vouchers.id", "vouchers.voucherNumber", "vouchers.voucherDate", "vouchers.amount", "vouchers.reference"])
    .where("vouchers.tenantId", "=", session.tenantId)
    .where("debit_acct.name", "=", "Salary Expense")
    .where("vouchers.reference", "like", `${employee.name}%`)
    .orderBy("vouchers.voucherDate", "desc")
    .execute();

  return NextResponse.json({
    employee: { ...employee, baseSalary: employee.baseSalary != null ? Number(employee.baseSalary) : null, advanceBalance: Number(employee.advanceBalance) },
    history: history.map((h) => ({ ...h, amount: Number(h.amount) })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const employee = await db
    .selectFrom("employees")
    .select("id")
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const role = body?.role;
  const baseSalary = body?.baseSalary;
  const status = body?.status;

  if (status && status !== "active" && status !== "inactive") {
    return NextResponse.json({ error: 'Status must be "active" or "inactive".' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (role !== undefined) updates.role = role?.trim() || null;
  if (baseSalary !== undefined) updates.baseSalary = baseSalary ? Number(baseSalary).toString() : null;
  if (status) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Note: renaming an employee does NOT rewrite past salary voucher
  // references — those correctly keep the name as it was at the time,
  // same principle as any real bookkeeping record. Only future salary
  // payments will be searched/matched under the new name.
  await db.updateTable("employees").set(updates).where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const employee = await db
    .selectFrom("employees")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const hasTransactions = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .select("vouchers.id")
    .where("vouchers.tenantId", "=", session.tenantId)
    .where("debit_acct.name", "=", "Salary Expense")
    .where("vouchers.reference", "like", `${employee.name}%`)
    .executeTakeFirst();

  if (hasTransactions) {
    return NextResponse.json(
      { error: `${employee.name} has real salary payment history and can't be deleted — use "Disable" instead to stop new payments without losing the record.` },
      { status: 409 }
    );
  }

  await db.deleteFrom("employees").where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}
