import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const employeeId = body?.employeeId;
  const type = body?.type === "commission" ? "commission" : "advance";
  const note = body?.note?.trim() || "";
  const amount = Number(body?.amount);
  const paidFrom = body?.paidFrom === "Bank" ? "Bank" : "Cash";

  if (!employeeId || !amount || amount <= 0) {
    return NextResponse.json({ error: "employeeId and a positive amount are required." }, { status: 400 });
  }

  const employee = await db
    .selectFrom("employees")
    .select(["id", "name"])
    .where("id", "=", employeeId)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const debitAccountName = type === "advance" ? "Staff Advances" : "Commission Expense";
  const debitAccountType = type === "advance" ? "asset" : "expense";
  const debitAccountId = await findOrCreateAccount(session.tenantId, debitAccountName, debitAccountType);
  const creditAccountId = await findOrCreateAccount(session.tenantId, paidFrom, paidFrom === "Cash" ? "cash" : "bank");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const result = await db.transaction().execute(async (trx) => {
    const voucher = await trx
      .insertInto("vouchers")
      .values({
        tenantId: session.tenantId,
        voucherNumber,
        voucherType: type === "advance" ? "employee_advance" : "commission",
        voucherDate: new Date().toISOString().slice(0, 10),
        debitAccountId,
        creditAccountId,
        amount: amount.toString(),
        reference: note ? `${employee.name} — ${type === "advance" ? "Advance" : "Commission"} — ${note}` : `${employee.name} — ${type === "advance" ? "Advance" : "Commission"}`,
        enteredBy: session.userId,
      })
      .returning(["id", "voucherNumber"])
      .executeTakeFirstOrThrow();

    if (type === "advance") {
      // Money the employee now owes back — tracked on the employee record
      // itself (advance_balance), separate from the general ledger account,
      // so the Employees list can show it at a glance without a join.
      await trx
        .updateTable("employees")
        .set(({ eb }) => ({ advanceBalance: eb("advanceBalance", "+", amount.toString()) }))
        .where("id", "=", employeeId)
        .execute();
    }

    return voucher;
  });

  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}
