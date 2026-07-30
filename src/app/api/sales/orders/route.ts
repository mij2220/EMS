import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const orders = await db
    .selectFrom("orders")
    .innerJoin("customers", "customers.id", "orders.customerId")
    .leftJoin("couriers", "couriers.id", "orders.courierId")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .select(({ fn }) => [
      "orders.id",
      "orders.orderNumber",
      "orders.status",
      "orders.paymentType",
      "orders.source",
      "orders.trackingNumber",
      "orders.placedAt",
      "customers.name as customerName",
      "customers.city",
      "couriers.name as courierName",
      fn.sum<string>(sql<number>`order_items.qty * order_items.unit_price`).as("amount"),
      fn.sum<string>(sql<number>`order_items.qty * (order_items.unit_price - order_items.unit_cost)`).as("profit"),
      fn.count<string>("orderItems.id").as("itemCount"),
    ])
    .where("orders.tenantId", "=", session.tenantId)
    .groupBy([
      "orders.id",
      "orders.orderNumber",
      "orders.status",
      "orders.paymentType",
      "orders.source",
      "orders.trackingNumber",
      "orders.placedAt",
      "customers.name",
      "customers.city",
      "couriers.name",
    ])
    .orderBy("orders.placedAt", "desc")
    .execute();

  return NextResponse.json({
    orders: orders.map((o) => ({
      ...o,
      amount: Number(o.amount ?? 0),
      // Returned orders show 0 profit — items are restocked, no sale is recognized (SRD 6.1)
      profit: o.status === "returned" ? 0 : Number(o.profit ?? 0),
      itemCount: Number(o.itemCount),
    })),
  });
}
