import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const product = await db
    .selectFrom("products")
    .selectAll()
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const variants = await db
    .selectFrom("variants")
    .leftJoin("locations", "locations.id", "variants.locationId")
    .select([
      "variants.id",
      "variants.sku",
      "variants.option1Value",
      "variants.option2Value",
      "variants.hsCode",
      "variants.binName",
      "variants.costPrice",
      "variants.salePrice",
      "variants.onHand",
      "variants.reorderLevel",
      "locations.name as locationName",
    ])
    .where("variants.productId", "=", id)
    .orderBy("variants.createdAt")
    .execute();

  return NextResponse.json({
    product,
    variants: variants.map((v) => ({
      ...v,
      costPrice: v.costPrice != null ? Number(v.costPrice) : null,
      salePrice: v.salePrice != null ? Number(v.salePrice) : null,
    })),
  });
}

// Product-level fields only — title, image, country of origin, option axis names.
// On-hand and per-variant fields are NOT editable here; that's the Variant routes'
// job, and on-hand specifically only changes via /api/inventory/stock-adjustments
// (see that route for why — same rule already validated in the mockup).
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const product = await db
    .selectFrom("products")
    .select("id")
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const updates: Record<string, string | null> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.imageUrl === "string") updates.imageUrl = body.imageUrl.trim() || null;
  if (typeof body?.countryOfOrigin === "string") updates.countryOfOrigin = body.countryOfOrigin.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.updateTable("products").set({ ...updates, updatedAt: new Date() }).where("id", "=", id).execute();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const product = await db
    .selectFrom("products")
    .select("id")
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  // variants cascade-delete via the FK in schema.sql, but stock_adjustments and
  // order_items referencing those variants do NOT cascade (by design — you don't
  // want a stock/order history row silently vanishing). If any variant under this
  // product has that kind of history, the delete is blocked at the database level;
  // catch that here so the person sees a clear reason instead of a raw 500.
  try {
    await db.deleteFrom("products").where("id", "=", id).execute();
  } catch {
    return NextResponse.json(
      {
        error:
          "This product has variants with stock-adjustment or order history and can't be deleted. Consider marking it inactive instead of deleting it.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
