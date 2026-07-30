import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const employees = await db.selectFrom("employees").selectAll().where("tenantId", "=", session.tenantId).orderBy("name").execute();

  const withPayments = await Promise.all(
    employees.map(async (e) => {
      const last = await db
        .selectFrom("vouchers")
        .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
        .select(["vouchers.voucherDate", "vouchers.amount"])
        .where("vouchers.tenantId", "=", session.tenantId)
        .where("debit_acct.name", "=", "Salary Expense")
        .where("vouchers.reference", "like", `${e.name}%`)
        .orderBy("vouchers.voucherDate", "desc")
        .executeTakeFirst();
      return {
        ...e,
        baseSalary: e.baseSalary != null ? Number(e.baseSalary) : null,
        advanceBalance: Number(e.advanceBalance),
        lastPaymentDate: last?.voucherDate ?? null,
        lastPaymentAmount: last ? Number(last.amount) : null,
      };
    })
  );

  return NextResponse.json({ employees: withPayments });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Employee name is required." }, { status: 400 });

  const employee = await db
    .insertInto("employees")
    .values({
      tenantId: session.tenantId,
      name,
      role: body?.role?.trim() || null,
      baseSalary: body?.baseSalary != null ? Number(body.baseSalary).toString() : null,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, employeeId: employee.id }, { status: 201 });
}
