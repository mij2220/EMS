import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const tenantId = session.tenantId;

  // ---- Stock Valuation (live, as-of-now) ----
  const valuationRows = await db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .select(["products.title", "variants.onHand", "variants.costPrice", "variants.salePrice"])
    .where("products.tenantId", "=", tenantId)
    .where("variants.onHand", ">", 0)
    .where("variants.costPrice", "is not", null)
    .where("variants.salePrice", "is not", null)
    .execute();

  let totalCostValue = 0;
  let totalRetailValue = 0;
  const byProduct = new Map<string, { onHand: number; costValue: number; retailValue: number }>();
  for (const r of valuationRows) {
    const cost = Number(r.costPrice) * r.onHand;
    const retail = Number(r.salePrice) * r.onHand;
    totalCostValue += cost;
    totalRetailValue += retail;
    const existing = byProduct.get(r.title) ?? { onHand: 0, costValue: 0, retailValue: 0 };
    existing.onHand += r.onHand;
    existing.costValue += cost;
    existing.retailValue += retail;
    byProduct.set(r.title, existing);
  }
  const topProducts = [...byProduct.entries()]
    .map(([title, v]) => ({ title, ...v }))
    .sort((a, b) => b.retailValue - a.retailValue)
    .slice(0, 10);

  // ---- Sales Summary (all-time, since the dataset is small) ----
  const salesRow = await db
    .selectFrom("orders")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .select(({ fn }) => [
      fn.count<string>(sql<string>`distinct orders.id`).as("orderCount"),
      fn.sum<string>(sql<number>`case when orders.status != 'returned' then order_items.qty * order_items.unit_price else 0 end`).as("netSales"),
      fn.sum<string>(sql<number>`order_items.qty * order_items.unit_price`).as("grossSales"),
    ])
    .where("orders.tenantId", "=", tenantId)
    .executeTakeFirst();

  // ---- Profit & Loss (all-time) ----
  const plRow = await db
    .selectFrom("orders")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .select(({ fn }) => [
      fn.sum<string>(sql<number>`case when orders.status != 'returned' then order_items.qty * order_items.unit_price else 0 end`).as("revenue"),
      fn.sum<string>(sql<number>`case when orders.status != 'returned' then order_items.qty * order_items.unit_cost else 0 end`).as("cogs"),
    ])
    .where("orders.tenantId", "=", tenantId)
    .executeTakeFirst();

  const expenseRow = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .select(({ fn }) => fn.sum<string>("vouchers.amount").as("total"))
    .where("vouchers.tenantId", "=", tenantId)
    .where("debit_acct.type", "=", "expense")
    .executeTakeFirst();

  const revenue = Number(plRow?.revenue ?? 0);
  const cogs = Number(plRow?.cogs ?? 0);
  const expenses = Number(expenseRow?.total ?? 0);

  // ---- Daily Account Report (day book) — every cash-affecting voucher, running balance ----
  const cashVouchers = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select(["vouchers.id", "vouchers.voucherDate", "vouchers.voucherType", "vouchers.reference", "vouchers.amount", "debit_acct.name as debitAccountName", "credit_acct.name as creditAccountName"])
    .where("vouchers.tenantId", "=", tenantId)
    .where((eb) => eb.or([eb("debit_acct.name", "=", "Cash"), eb("credit_acct.name", "=", "Cash")]))
    .orderBy("vouchers.voucherDate", "asc")
    .orderBy("vouchers.createdAt", "asc")
    .execute();

  let running = 0;
  const dayBook = cashVouchers.map((v) => {
    const amount = Number(v.amount);
    const delta = v.debitAccountName === "Cash" ? amount : -amount;
    running += delta;
    return { ...v, amount, delta, runningBalance: running };
  });

  return NextResponse.json({
    stockValuation: { totalCostValue, totalRetailValue, topProducts },
    sales: {
      orderCount: Number(salesRow?.orderCount ?? 0),
      grossSales: Number(salesRow?.grossSales ?? 0),
      netSales: Number(salesRow?.netSales ?? 0),
    },
    profitLoss: { revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses },
    dayBook,
  });
}
