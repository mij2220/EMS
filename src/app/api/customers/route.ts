import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const customers = await db
    .selectFrom("customers")
    .leftJoin("orders", "orders.customerId", "customers.id")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .select(({ fn }) => [
      "customers.id",
      "customers.name",
      "customers.phone",
      "customers.city",
      fn.count<string>(sql<string>`distinct orders.id`).as("orderCount"),
      fn.sum<string>(sql<number>`case when orders.status != 'returned' then order_items.qty * order_items.unit_price else 0 end`).as("lifetimeValue"),
      fn.count<string>(sql<string>`distinct case when orders.status = 'returned' then orders.id end`).as("returnCount"),
    ])
    .where("customers.tenantId", "=", session.tenantId)
    .groupBy(["customers.id", "customers.name", "customers.phone", "customers.city"])
    .orderBy("customers.name")
    .execute();

  return NextResponse.json({
    customers: customers.map((c) => ({
      ...c,
      orderCount: Number(c.orderCount),
      lifetimeValue: Number(c.lifetimeValue ?? 0),
      returnCount: Number(c.returnCount),
    })),
  });
}
