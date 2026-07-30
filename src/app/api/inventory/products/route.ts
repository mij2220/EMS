import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { sql } from "kysely";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const products = await db
    .selectFrom("products")
    .leftJoin("variants", "variants.productId", "products.id")
    .leftJoin("locations", "locations.id", "variants.locationId")
    .select(({ fn }) => [
      "products.id",
      "products.handle",
      "products.title",
      "products.status",
      "products.imageUrl",
      "products.option1Name",
      "products.option2Name",
      fn.count<string>("variants.id").as("variantCount"),
      fn.coalesce(fn.sum<string>("variants.onHand"), sql<string>`0`).as("totalOnHand"),
      fn.min<string>("variants.salePrice").as("minPrice"),
      fn.max<string>("variants.salePrice").as("maxPrice"),
      fn.min<string>("variants.costPrice").as("minCost"),
      fn.max<string>("variants.costPrice").as("maxCost"),
      fn
        .count<string>(sql<string>`case when variants.sku is null or variants.sku = '' then 1 end`)
        .as("missingSkuCount"),
      fn.agg<string[]>("array_agg", [sql`distinct locations.name`]).as("locationNames"),
    ])
    .where("products.tenantId", "=", session.tenantId)
    .groupBy([
      "products.id",
      "products.handle",
      "products.title",
      "products.status",
      "products.imageUrl",
      "products.option1Name",
      "products.option2Name",
    ])
    .orderBy("products.title")
    .execute();

  return NextResponse.json({
    products: products.map((p) => ({
      ...p,
      variantCount: Number(p.variantCount),
      totalOnHand: Number(p.totalOnHand),
      minPrice: p.minPrice != null ? Number(p.minPrice) : null,
      maxPrice: p.maxPrice != null ? Number(p.maxPrice) : null,
      minCost: p.minCost != null ? Number(p.minCost) : null,
      maxCost: p.maxCost != null ? Number(p.maxCost) : null,
      hasMissingSku: Number(p.missingSkuCount) > 0,
      locationNames: (p.locationNames ?? []).filter((n): n is string => n != null),
    })),
    locations: [...new Set(products.flatMap((p) => (p.locationNames ?? []).filter((n): n is string => n != null)))].sort(),
  });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  const handle =
    body?.handle?.trim() ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const existing = await db
    .selectFrom("products")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("handle", "=", handle)
    .executeTakeFirst();
  if (existing) {
    return NextResponse.json({ error: "A product with this handle already exists." }, { status: 409 });
  }

  const location = await db
    .selectFrom("locations")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("isDefault", "=", true)
    .executeTakeFirst();

  const product = await db
    .insertInto("products")
    .values({
      tenantId: session.tenantId,
      handle,
      title,
      option1Name: body?.option1Name?.trim() || "Color",
      option2Name: body?.option2Name?.trim() || "Size",
      countryOfOrigin: body?.countryOfOrigin?.trim() || null,
      imageUrl: body?.imageUrl?.trim() || null,
      status: "active",
      channel: "manual",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  // Every product needs at least one variant to be usable — create it from the same form.
  const cost = body?.costPrice != null ? Number(body.costPrice) : null;
  const price = body?.salePrice != null ? Number(body.salePrice) : null;
  const onHand = body?.onHand != null ? Number(body.onHand) : 0;

  const variant = await db
    .insertInto("variants")
    .values({
      productId: product.id,
      option1Value: body?.option1Value?.trim() || "Default",
      option2Value: body?.option2Value?.trim() || "Free Size",
      sku: body?.sku?.trim() || null,
      hsCode: body?.hsCode?.trim() || null,
      locationId: location?.id ?? null,
      binName: body?.binName?.trim() || null,
      costPrice: cost != null ? cost.toString() : null,
      salePrice: price != null ? price.toString() : null,
      onHand,
      reorderLevel: 30,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, productId: product.id, variantId: variant.id }, { status: 201 });
}
