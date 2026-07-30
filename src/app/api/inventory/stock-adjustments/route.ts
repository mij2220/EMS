import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

const VALID_REASONS = ["damaged", "sample", "recount", "returned_to_stock", "received_po", "other"];

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const variantId = body?.variantId;
  const qtyDelta = Number(body?.qtyDelta);
  const reasonCode = body?.reasonCode;
  const note = body?.note?.trim() || null;

  if (!variantId || !qtyDelta || !Number.isInteger(qtyDelta)) {
    return NextResponse.json({ error: "variantId and a non-zero integer qtyDelta are required." }, { status: 400 });
  }
  if (!VALID_REASONS.includes(reasonCode)) {
    return NextResponse.json({ error: `reasonCode must be one of: ${VALID_REASONS.join(", ")}` }, { status: 400 });
  }

  const variant = await db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .select(["variants.id", "variants.onHand"])
    .where("variants.id", "=", variantId)
    .where("products.tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

  if (qtyDelta < 0 && variant.onHand + qtyDelta < 0) {
    return NextResponse.json(
      { error: `Cannot remove ${Math.abs(qtyDelta)} units — only ${variant.onHand} on hand.` },
      { status: 409 }
    );
  }

  // Both writes happen in one transaction: the audit row and the actual stock
  // change must never happen one without the other.
  const result = await db.transaction().execute(async (trx) => {
    const adjustment = await trx
      .insertInto("stockAdjustments")
      .values({
        tenantId: session.tenantId,
        variantId,
        qtyDelta,
        reasonCode,
        note,
        userId: session.userId,
      })
      .returning(["id", "createdAt"])
      .executeTakeFirstOrThrow();

    const updated = await trx
      .updateTable("variants")
      .set((eb) => ({ onHand: eb("onHand", "+", qtyDelta) }))
      .where("id", "=", variantId)
      .returning(["onHand"])
      .executeTakeFirstOrThrow();

    return { adjustment, newOnHand: updated.onHand };
  });

  return NextResponse.json({ ok: true, ...result }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const variantId = req.nextUrl.searchParams.get("variantId");
  let query = db
    .selectFrom("stockAdjustments")
    .innerJoin("variants", "variants.id", "stockAdjustments.variantId")
    .innerJoin("products", "products.id", "variants.productId")
    .innerJoin("users", "users.id", "stockAdjustments.userId")
    .select([
      "stockAdjustments.id",
      "stockAdjustments.qtyDelta",
      "stockAdjustments.reasonCode",
      "stockAdjustments.note",
      "stockAdjustments.createdAt",
      "products.title as productTitle",
      "variants.option1Value",
      "variants.option2Value",
      "users.name as userName",
    ])
    .where("stockAdjustments.tenantId", "=", session.tenantId)
    .orderBy("stockAdjustments.createdAt", "desc");

  if (variantId) query = query.where("variants.id", "=", variantId);

  const rows = await query.limit(100).execute();
  return NextResponse.json({ adjustments: rows });
}
