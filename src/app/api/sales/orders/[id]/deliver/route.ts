import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const order = await db
    .selectFrom("orders")
    .select(["id", "status", "inventoryDeducted"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status === "delivered") return NextResponse.json({ error: "Already marked Delivered." }, { status: 409 });
  if (order.status === "returned") {
    return NextResponse.json({ error: "This order was returned — cannot mark it Delivered from here." }, { status: 409 });
  }

  const items = await db.selectFrom("orderItems").select(["variantId", "qty"]).where("orderId", "=", id).execute();

  // Same rule already validated against the mockup: on-hand only actually decreases
  // at Delivered, never at Dispatch — this is that decision, made real.
  await db.transaction().execute(async (trx) => {
    for (const it of items) {
      await trx
        .updateTable("variants")
        .set((eb) => ({ onHand: eb("onHand", "-", it.qty) }))
        .where("id", "=", it.variantId)
        .execute();
    }
    await trx
      .updateTable("orders")
      .set({ status: "delivered", deliveredAt: new Date(), inventoryDeducted: true })
      .where("id", "=", id)
      .execute();
  });

  return NextResponse.json({ ok: true });
}
