import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const order = await db
    .selectFrom("orders")
    .innerJoin("customers", "customers.id", "orders.customerId")
    .leftJoin("couriers", "couriers.id", "orders.courierId")
    .select([
      "orders.id",
      "orders.orderNumber",
      "orders.status",
      "orders.paymentType",
      "orders.source",
      "orders.trackingNumber",
      "orders.remarks",
      "orders.placedAt",
      "orders.packedAt",
      "orders.dispatchedAt",
      "orders.deliveredAt",
      "orders.returnedAt",
      "orders.inventoryDeducted",
      "customers.id as customerId",
      "customers.name as customerName",
      "customers.phone as customerPhone",
      "customers.address as customerAddress",
      "customers.city as customerCity",
      "couriers.name as courierName",
    ])
    .where("orders.id", "=", id)
    .where("orders.tenantId", "=", session.tenantId)
    .executeTakeFirst();

  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const items = await db
    .selectFrom("orderItems")
    .innerJoin("variants", "variants.id", "orderItems.variantId")
    .innerJoin("products", "products.id", "variants.productId")
    .select([
      "orderItems.id",
      "orderItems.qty",
      "orderItems.unitPrice",
      "orderItems.unitCost",
      "products.title as productTitle",
      "variants.option1Value",
      "variants.option2Value",
    ])
    .where("orderItems.orderId", "=", id)
    .execute();

  return NextResponse.json({
    order,
    items: items.map((it) => ({
      ...it,
      unitPrice: Number(it.unitPrice),
      unitCost: Number(it.unitCost),
    })),
  });
}
