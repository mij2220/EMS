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
  if (order.status === "returned") return NextResponse.json({ error: "Already marked Returned." }, { status: 409 });

  const items = await db.selectFrom("orderItems").select(["variantId", "qty"]).where("orderId", "=", id).execute();

  await db.transaction().execute(async (trx) => {
    // Only restock if it had actually been deducted — i.e. this order previously
    // reached Delivered. If it's being returned while still Dispatched/In Transit,
    // on-hand was never reduced in the first place, so there's nothing to add back.
    if (order.inventoryDeducted) {
      for (const it of items) {
        await trx
          .updateTable("variants")
          .set((eb) => ({ onHand: eb("onHand", "+", it.qty) }))
          .where("id", "=", it.variantId)
          .execute();
      }
    }
    await trx
      .updateTable("orders")
      .set({ status: "returned", returnedAt: new Date(), inventoryDeducted: false })
      .where("id", "=", id)
      .execute();
  });

  return NextResponse.json({ ok: true, restocked: order.inventoryDeducted });
}
