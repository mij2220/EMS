import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id: productId } = await params;

  const product = await db
    .selectFrom("products")
    .select("id")
    .where("id", "=", productId)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const location = await db
    .selectFrom("locations")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("isDefault", "=", true)
    .executeTakeFirst();

  const body = await req.json().catch(() => null);
  const cost = body?.costPrice != null ? Number(body.costPrice) : null;
  const price = body?.salePrice != null ? Number(body.salePrice) : null;
  const onHand = body?.onHand != null ? Number(body.onHand) : 0;

  const variant = await db
    .insertInto("variants")
    .values({
      productId,
      option1Value: body?.option1Value?.trim() || "Default",
      option2Value: body?.option2Value?.trim() || "Free Size",
      sku: body?.sku?.trim() || null,
      hsCode: body?.hsCode?.trim() || null,
      locationId: location?.id ?? null,
      binName: body?.binName?.trim() || null,
      costPrice: cost != null ? cost.toString() : null,
      salePrice: price != null ? price.toString() : null,
      onHand,
      reorderLevel: body?.reorderLevel != null ? Number(body.reorderLevel) : 30,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, variantId: variant.id }, { status: 201 });
}
