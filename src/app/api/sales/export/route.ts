import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";
import { buildXlsxResponse } from "@/lib/xlsx-export";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const status = searchParams.get("status") ?? "";
  const courierName = searchParams.get("courier") ?? "";
  const source = searchParams.get("source") ?? "";

  let query = db
    .selectFrom("orders")
    .innerJoin("customers", "customers.id", "orders.customerId")
    .leftJoin("couriers", "couriers.id", "orders.courierId")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .select(({ fn }) => [
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
    .orderBy("orders.placedAt", "desc");

  // Same filters as the Sales & Delivery page — applied here too so
  // "Export filtered" matches exactly what's on screen, not the full table.
  if (status) query = query.where("orders.status", "=", status);
  if (source) query = query.where("orders.source", "=", source);
  if (courierName) query = query.where("couriers.name", "=", courierName);

  let rows = await query.execute();

  if (q) {
    rows = rows.filter(
      (r) =>
        r.orderNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q)
    );
  }

  return buildXlsxResponse(
    "Orders",
    [
      { header: "Order #", key: "orderNumber", width: 14 },
      { header: "Date", key: "placedAt", width: 14 },
      { header: "Customer", key: "customerName", width: 22 },
      { header: "City", key: "city", width: 16 },
      { header: "Items", key: "itemCount", width: 8 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Profit", key: "profit", width: 12 },
      { header: "Payment", key: "paymentType", width: 12 },
      { header: "Courier", key: "courierName", width: 16 },
      { header: "Tracking #", key: "trackingNumber", width: 20 },
      { header: "Source", key: "source", width: 14 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows.map((r) => ({
      ...r,
      placedAt: r.placedAt ? new Date(r.placedAt).toISOString().slice(0, 10) : "",
      amount: Number(r.amount ?? 0),
      profit: r.status === "returned" ? 0 : Number(r.profit ?? 0),
      itemCount: Number(r.itemCount),
    })),
    "orders-export"
  );
}
