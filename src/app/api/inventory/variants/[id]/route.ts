import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

// Confirms the variant belongs to a product owned by this session's tenant —
// prevents one tenant editing another tenant's variant by guessing an ID.
async function findOwnedVariant(variantId: string, tenantId: string) {
  return db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .select(["variants.id", "variants.productId"])
    .where("variants.id", "=", variantId)
    .where("products.tenantId", "=", tenantId)
    .executeTakeFirst();
}

// Master-data fields only: color/size, SKU, HS code, bin, cost, price, reorder level.
// On-hand is deliberately excluded — it can only change via POST
// /api/inventory/stock-adjustments, so every quantity change is reason-coded and
// audit-logged rather than silently overwritten here. Matches the rule already
// validated in the mockup after a client review caught it being bypassable.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const variant = await findOwnedVariant(id, session.tenantId);
  if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const updates: Record<string, string | number | null> = {};
  if (typeof body?.option1Value === "string") updates.option1Value = body.option1Value.trim();
  if (typeof body?.option2Value === "string") updates.option2Value = body.option2Value.trim();
  if (typeof body?.sku === "string") updates.sku = body.sku.trim() || null;
  if (typeof body?.hsCode === "string") updates.hsCode = body.hsCode.trim() || null;
  if (typeof body?.binName === "string") updates.binName = body.binName.trim() || null;
  if (body?.costPrice != null) updates.costPrice = Number(body.costPrice).toString();
  if (body?.salePrice != null) updates.salePrice = Number(body.salePrice).toString();
  if (body?.reorderLevel != null) updates.reorderLevel = Number(body.reorderLevel);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.updateTable("variants").set({ ...updates, updatedAt: new Date() }).where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const variant = await findOwnedVariant(id, session.tenantId);
  if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

  const siblingCount = await db
    .selectFrom("variants")
    .select(({ fn }) => fn.count<string>("id").as("count"))
    .where("productId", "=", variant.productId)
    .executeTakeFirstOrThrow();
  if (Number(siblingCount.count) <= 1) {
    return NextResponse.json(
      { error: "A product needs at least one variant. Delete the product instead if it's no longer sold." },
      { status: 409 }
    );
  }

  try {
    await db.deleteFrom("variants").where("id", "=", id).execute();
  } catch {
    return NextResponse.json(
      { error: "This variant has order or adjustment history and can't be deleted. Consider deactivating it instead." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
