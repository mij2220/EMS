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

  // ---- Courier Summary (live) — outstanding balance and order counts per courier ----
  const couriersRaw = await db.selectFrom("couriers").select(["id", "name"]).where("tenantId", "=", tenantId).execute();
  const courierSummary = await Promise.all(
    couriersRaw.map(async (c) => {
      const accountName = `Courier Receivable — ${c.name}`;
      const balanceRow = await db
        .selectFrom("vouchers")
        .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
        .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
        .select(({ fn }) => [
          fn
            .sum<string>(
              sql<number>`case when debit_acct.name = ${accountName} then vouchers.amount when credit_acct.name = ${accountName} then -vouchers.amount else 0 end`
            )
            .as("balance"),
        ])
        .where("vouchers.tenantId", "=", tenantId)
        .executeTakeFirst();

      const orderStats = await db
        .selectFrom("orders")
        .select(({ fn }) => [
          fn.count<string>("id").as("orderCount"),
          fn.count<string>(sql<string>`case when status = 'delivered' then 1 end`).as("deliveredCount"),
          fn.count<string>(sql<string>`case when status = 'returned' then 1 end`).as("returnedCount"),
        ])
        .where("tenantId", "=", tenantId)
        .where("courierId", "=", c.id)
        .executeTakeFirst();

      return {
        courierId: c.id,
        courierName: c.name,
        outstandingBalance: Number(balanceRow?.balance ?? 0),
        orderCount: Number(orderStats?.orderCount ?? 0),
        deliveredCount: Number(orderStats?.deliveredCount ?? 0),
        returnedCount: Number(orderStats?.returnedCount ?? 0),
      };
    })
  );

  // ---- Payable (live) — outstanding balance per vendor ----
  const vendorsRaw = await db.selectFrom("vendors").select(["id", "name"]).where("tenantId", "=", tenantId).execute();
  const payable = await Promise.all(
    vendorsRaw.map(async (v) => {
      const accountName = `Vendor — ${v.name}`;
      const row = await db
        .selectFrom("vouchers")
        .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
        .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
        .select(({ fn }) => [
          fn
            .sum<string>(
              sql<number>`case when credit_acct.name = ${accountName} then vouchers.amount when debit_acct.name = ${accountName} then -vouchers.amount else 0 end`
            )
            .as("balance"),
          fn.max<string>(sql<string>`case when credit_acct.name = ${accountName} or debit_acct.name = ${accountName} then vouchers.voucher_date::text end`).as("lastActivity"),
        ])
        .where("vouchers.tenantId", "=", tenantId)
        .executeTakeFirst();

      return { vendorId: v.id, vendorName: v.name, payableBalance: Number(row?.balance ?? 0), lastActivity: row?.lastActivity ?? null };
    })
  );

  // ---- Expense Breakdown by category (live) — every expense-type account, including Salary ----
  const expenseRows = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .select(["debit_acct.name as category", "vouchers.amount"])
    .where("vouchers.tenantId", "=", tenantId)
    .where("debit_acct.type", "=", "expense")
    .execute();
  const expenseByCategory = new Map<string, number>();
  for (const r of expenseRows) {
    expenseByCategory.set(r.category, (expenseByCategory.get(r.category) ?? 0) + Number(r.amount));
  }
  const expenseCategories = [...expenseByCategory.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // ---- Low Stock Alert (live) — variants at or below their reorder level ----
  const lowStockRaw = await db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .select(["products.title", "variants.option1Value", "variants.option2Value", "variants.onHand", "variants.reorderLevel"])
    .where("products.tenantId", "=", tenantId)
    .whereRef("variants.onHand", "<=", "variants.reorderLevel")
    .execute();
  const lowStock = lowStockRaw
    .map((r) => ({
      title: r.title,
      variant: [r.option1Value, r.option2Value].filter(Boolean).join(" / ") || "—",
      onHand: r.onHand,
      reorderLevel: r.reorderLevel,
      status: r.onHand <= 0 ? "Out of stock" : "Reorder",
    }))
    .sort((a, b) => a.reorderLevel - a.onHand - (b.reorderLevel - b.onHand)).reverse();

  // ---- Dead Stock (live) — real stock value with no non-returned sale in 30 days ----
  const deadStockRaw = await db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .leftJoin("orderItems", "orderItems.variantId", "variants.id")
    .leftJoin("orders", (join) => join.onRef("orders.id", "=", "orderItems.orderId").on("orders.status", "!=", "returned"))
    .select(({ fn }) => [
      "products.title",
      "variants.id as variantId",
      "variants.option1Value",
      "variants.option2Value",
      "variants.onHand",
      "variants.costPrice",
      fn.max<string>("orders.placedAt").as("lastSaleAt"),
    ])
    .where("products.tenantId", "=", tenantId)
    .where("variants.onHand", ">", 0)
    .where("variants.costPrice", "is not", null)
    .groupBy(["products.title", "variants.id", "variants.option1Value", "variants.option2Value", "variants.onHand", "variants.costPrice"])
    .execute();
  const DEAD_STOCK_DAYS = 30;
  const deadStock = deadStockRaw
    .map((r) => {
      const daysSince = r.lastSaleAt ? Math.floor((Date.now() - new Date(r.lastSaleAt).getTime()) / 86_400_000) : null;
      return {
        title: r.title,
        variant: [r.option1Value, r.option2Value].filter(Boolean).join(" / ") || "—",
        onHand: r.onHand,
        daysSinceLastSale: daysSince,
        valueTiedUp: r.onHand * Number(r.costPrice),
      };
    })
    .filter((r) => r.daysSinceLastSale === null || r.daysSinceLastSale > DEAD_STOCK_DAYS)
    .sort((a, b) => b.valueTiedUp - a.valueTiedUp)
    .slice(0, 50);

  // ---- Stock Adjustment History (live) — most recent 100 manual changes ----
  const stockAdjustmentsRaw = await db
    .selectFrom("stockAdjustments")
    .innerJoin("variants", "variants.id", "stockAdjustments.variantId")
    .innerJoin("products", "products.id", "variants.productId")
    .leftJoin("users", "users.id", "stockAdjustments.userId")
    .select([
      "stockAdjustments.id",
      "stockAdjustments.createdAt",
      "products.title",
      "variants.option1Value",
      "variants.option2Value",
      "stockAdjustments.qtyDelta",
      "stockAdjustments.reasonCode",
      "stockAdjustments.note",
      "users.name as userName",
    ])
    .where("stockAdjustments.tenantId", "=", tenantId)
    .orderBy("stockAdjustments.createdAt", "desc")
    .limit(100)
    .execute();
  const stockAdjustments = stockAdjustmentsRaw.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    title: r.title,
    variant: [r.option1Value, r.option2Value].filter(Boolean).join(" / ") || "—",
    qtyDelta: r.qtyDelta,
    reasonCode: r.reasonCode,
    note: r.note,
    userName: r.userName ?? "—",
  }));

  // ---- Missing Info Checklist (live) — products missing SKU, cost, or photo ----
  const missingInfoRaw = await db
    .selectFrom("products")
    .leftJoin("variants", "variants.productId", "products.id")
    .select(({ fn }) => [
      "products.id",
      "products.title",
      "products.imageUrl",
      fn.count<string>(sql<string>`case when variants.sku is null or variants.sku = '' then 1 end`).as("missingSkuCount"),
      fn.count<string>(sql<string>`case when variants.cost_price is null then 1 end`).as("missingCostCount"),
    ])
    .where("products.tenantId", "=", tenantId)
    .groupBy(["products.id", "products.title", "products.imageUrl"])
    .execute();
  const missingInfo = missingInfoRaw
    .map((r) => {
      const missing: string[] = [];
      if (Number(r.missingSkuCount) > 0) missing.push("SKU");
      if (Number(r.missingCostCount) > 0) missing.push("Cost price");
      if (!r.imageUrl) missing.push("Photo");
      return { title: r.title, missing };
    })
    .filter((r) => r.missing.length > 0);

  // ---- Best & Worst Sellers (last 30 days, non-returned) ----
  const sellerWindowStart = new Date(Date.now() - 30 * 86_400_000);
  const sellerRaw = await db
    .selectFrom("orderItems")
    .innerJoin("orders", "orders.id", "orderItems.orderId")
    .innerJoin("variants", "variants.id", "orderItems.variantId")
    .innerJoin("products", "products.id", "variants.productId")
    .select(({ fn }) => [
      "products.title",
      "variants.option1Value",
      "variants.option2Value",
      fn.sum<string>("orderItems.qty").as("unitsSold"),
      fn.sum<string>(sql<number>`order_items.qty * order_items.unit_price`).as("revenue"),
    ])
    .where("orders.tenantId", "=", tenantId)
    .where("orders.status", "!=", "returned")
    .where("orders.placedAt", ">=", sellerWindowStart)
    .groupBy(["products.title", "variants.id", "variants.option1Value", "variants.option2Value"])
    .execute();
  const bestWorstSellers = sellerRaw
    .map((r) => ({
      title: r.title,
      variant: [r.option1Value, r.option2Value].filter(Boolean).join(" / ") || "—",
      unitsSold: Number(r.unitsSold),
      revenue: Number(r.revenue),
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold);

  return NextResponse.json({
    stockValuation: { totalCostValue, totalRetailValue, topProducts },
    lowStock,
    deadStock,
    stockAdjustments,
    missingInfo,
    bestWorstSellers,
    sales: {
      orderCount: Number(salesRow?.orderCount ?? 0),
      grossSales: Number(salesRow?.grossSales ?? 0),
      netSales: Number(salesRow?.netSales ?? 0),
    },
    profitLoss: { revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses },
    dayBook,
    courierSummary,
    payable,
    expenseCategories,
  });
}
