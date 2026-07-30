import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const courier = await db
    .selectFrom("couriers")
    .selectAll()
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!courier) return NextResponse.json({ error: "Courier not found." }, { status: 404 });

  const ledger = await db
    .selectFrom("courierLedgerEntries")
    .leftJoin("orders", "orders.id", "courierLedgerEntries.orderId")
    .select(["courierLedgerEntries.id", "courierLedgerEntries.entryType", "courierLedgerEntries.amount", "courierLedgerEntries.balanceAfter", "courierLedgerEntries.createdAt", "orders.orderNumber"])
    .where("courierLedgerEntries.tenantId", "=", session.tenantId)
    .where("courierLedgerEntries.courierId", "=", id)
    .orderBy("courierLedgerEntries.createdAt", "desc")
    .execute();

  const remittanceBatches = await db
    .selectFrom("courierRemittanceBatches")
    .select(["id", "batchNumber", "amount", "status", "createdAt"])
    .where("tenantId", "=", session.tenantId)
    .where("courierId", "=", id)
    .orderBy("createdAt", "desc")
    .execute();

  // COD Variance: every order assigned to this courier, its slip amount, and
  // whether/how much was actually remitted for it (via the remittance-orders join table)
  const variance = await db
    .selectFrom("orders")
    .innerJoin("customers", "customers.id", "orders.customerId")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .leftJoin("courierRemittanceOrders", "courierRemittanceOrders.orderId", "orders.id")
    .select(({ fn }) => [
      "orders.id",
      "orders.orderNumber",
      "orders.status",
      "customers.name as customerName",
      "customers.city",
      fn.sum<string>(sql<number>`order_items.qty * order_items.unit_price`).as("slipAmount"),
      fn.max<string>(sql<string>`courier_remittance_orders.remitted_amount::text`).as("remittedAmount"),
    ])
    .where("orders.tenantId", "=", session.tenantId)
    .where("orders.courierId", "=", id)
    .groupBy(["orders.id", "orders.orderNumber", "orders.status", "customers.name", "customers.city"])
    .orderBy("orders.placedAt", "desc")
    .execute();

  return NextResponse.json({
    courier: { ...courier, commissionPercent: courier.commissionPercent != null ? Number(courier.commissionPercent) : 0, commissionFlat: courier.commissionFlat != null ? Number(courier.commissionFlat) : 0 },
    ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount), balanceAfter: Number(l.balanceAfter) })),
    remittanceBatches: remittanceBatches.map((b) => ({ ...b, amount: Number(b.amount) })),
    variance: variance.map((v) => ({
      ...v,
      slipAmount: Number(v.slipAmount ?? 0),
      remittedAmount: v.remittedAmount != null ? Number(v.remittedAmount) : null,
    })),
  });
}
