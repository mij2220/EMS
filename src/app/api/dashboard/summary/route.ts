import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const tenantId = session.tenantId;

  const [productCount, orderCount, cashBalanceRow, courierReceivableRow] = await Promise.all([
    db.selectFrom("products").select(db.fn.count<string>("id").as("count")).where("tenantId", "=", tenantId).executeTakeFirst(),
    db.selectFrom("orders").select(db.fn.count<string>("id").as("count")).where("tenantId", "=", tenantId).executeTakeFirst(),
    // Cash balance = sum of vouchers debiting the Cash account minus those crediting it
    db
      .selectFrom("vouchers")
      .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
      .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
      .select(({ fn }) => [
        fn
          .sum<string>(
            sql<number>`case when debit_acct.name = 'Cash' then vouchers.amount when credit_acct.name = 'Cash' then -vouchers.amount else 0 end`
          )
          .as("balance"),
      ])
      .where("vouchers.tenantId", "=", tenantId)
      .executeTakeFirst(),
    db
      .selectFrom("accounts")
      .select("id")
      .where("tenantId", "=", tenantId)
      .where("name", "=", "Courier Receivable — M&P")
      .executeTakeFirst(),
  ]);

  return NextResponse.json({
    tenantId,
    productCount: Number(productCount?.count ?? 0),
    orderCount: Number(orderCount?.count ?? 0),
    cashBalance: Number(cashBalanceRow?.balance ?? 0),
    courierReceivableAccountFound: !!courierReceivableRow,
  });
}
