import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { findOrCreateAccount, nextVoucherNumber } from "@/lib/accounts-helpers";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const employeeId = body?.employeeId;
  const period = body?.period?.trim() || "this period";
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

  const debitAccountId = await findOrCreateAccount(session.tenantId, "Salary Expense", "expense");
  const creditAccountId = await findOrCreateAccount(session.tenantId, paidFrom, paidFrom === "Cash" ? "cash" : "bank");
  const voucherNumber = await nextVoucherNumber(session.tenantId);

  const voucher = await db
    .insertInto("vouchers")
    .values({
      tenantId: session.tenantId,
      voucherNumber,
      voucherType: "salary",
      voucherDate: new Date().toISOString().slice(0, 10),
      debitAccountId,
      creditAccountId,
      amount: amount.toString(),
      reference: `${employee.name} — ${period}`,
      enteredBy: session.userId,
    })
    .returning(["id", "voucherNumber"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, ...voucher }, { status: 201 });
}
