import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

// Same debit/credit convention throughout this file: for an asset-type account
// (cash, receivable), a DEBIT increases its balance and a CREDIT decreases it.
// For a liability-type account (payable), it's the reverse: a CREDIT increases
// what's owed, a DEBIT (paying it down) decreases it. This was a real bug caught
// on the Dashboard (Courier Receivable had it backwards) — fixed here too.
async function balanceForAccountType(tenantId: string, type: "receivable" | "payable" | "cash") {
  const isAsset = type === "cash" || type === "receivable";
  const nameFilter = type === "cash" ? sql<boolean>`debit_acct.name = 'Cash' or credit_acct.name = 'Cash'` : sql<boolean>`true`;

  const row = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select(({ fn }) => [
      fn
        .sum<string>(
          type === "cash"
            ? sql<number>`case when debit_acct.name = 'Cash' then vouchers.amount when credit_acct.name = 'Cash' then -vouchers.amount else 0 end`
            : isAsset
            ? sql<number>`case when debit_acct.type = ${sql.lit(type)} then vouchers.amount when credit_acct.type = ${sql.lit(type)} then -vouchers.amount else 0 end`
            : sql<number>`case when credit_acct.type = ${sql.lit(type)} then vouchers.amount when debit_acct.type = ${sql.lit(type)} then -vouchers.amount else 0 end`
        )
        .as("balance"),
    ])
    .where("vouchers.tenantId", "=", tenantId)
    .where(nameFilter)
    .executeTakeFirst();

  return Number(row?.balance ?? 0);
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const tenantId = session.tenantId;

  const [cash, vendorPayable, courierReceivable, monthExpenseRow] = await Promise.all([
    balanceForAccountType(tenantId, "cash"),
    balanceForAccountType(tenantId, "payable"),
    balanceForAccountType(tenantId, "receivable"),
    db
      .selectFrom("vouchers")
      .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
      .select(({ fn }) => fn.sum<string>("vouchers.amount").as("total"))
      .where("vouchers.tenantId", "=", tenantId)
      .where((eb) => eb.or([eb("debit_acct.type", "=", "expense")]))
      .where(sql<boolean>`date_trunc('month', vouchers.voucher_date) = date_trunc('month', current_date)`)
      .executeTakeFirst(),
  ]);

  return NextResponse.json({
    cash,
    vendorPayable,
    courierReceivable,
    monthExpenses: Number(monthExpenseRow?.total ?? 0),
  });
}
