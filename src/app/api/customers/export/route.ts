import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";
import { buildXlsxResponse } from "@/lib/xlsx-export";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const customers = await db
    .selectFrom("customers")
    .leftJoin("orders", "orders.customerId", "customers.id")
    .leftJoin("orderItems", "orderItems.orderId", "orders.id")
    .select(({ fn }) => [
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

  const filtered = q
    ? customers.filter(
        (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q)
      )
    : customers;

  return buildXlsxResponse(
    "Customers",
    [
      { header: "Name", key: "name", width: 24 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "City", key: "city", width: 16 },
      { header: "Orders", key: "orderCount", width: 10 },
      { header: "Lifetime Value", key: "lifetimeValue", width: 16 },
      { header: "Returns", key: "returnCount", width: 10 },
    ],
    filtered.map((c) => ({ ...c, orderCount: Number(c.orderCount), lifetimeValue: Number(c.lifetimeValue ?? 0), returnCount: Number(c.returnCount) })),
    "customers-export"
  );
}
