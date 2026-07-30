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
