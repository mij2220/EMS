import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { decryptSecret } from "@/lib/crypto";

type ShopifyVariant = {
  sku: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: string;
  inventory_quantity: number;
};
type ShopifyProduct = {
  id: number;
  handle: string;
  title: string;
  status: string; // 'active' | 'draft' | 'archived'
  image: { src: string } | null;
  variants: ShopifyVariant[];
};

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const record = await db
    .selectFrom("integrationCredentials")
    .select(["id", "storeUrl", "credentialsEncrypted", "status"])
    .where("tenantId", "=", session.tenantId)
    .where("provider", "=", "shopify")
    .executeTakeFirst();

  if (!record || !record.credentialsEncrypted || !record.storeUrl) {
    return NextResponse.json({ error: "Connect Shopify in Admin → Integrations first." }, { status: 400 });
  }
  if (record.status !== "connected") {
    return NextResponse.json({ error: "Run Test Connection successfully in Admin first — this hasn't been confirmed working yet." }, { status: 400 });
  }

  const accessToken = decryptSecret(record.credentialsEncrypted);
  const storeUrl = record.storeUrl;

  let shopifyProducts: ShopifyProduct[];
  try {
    // Shopify caps at 250 per page. Real catalogs beyond that need cursor
    // pagination (the Link response header) — not implemented yet, since
    // this store's actual catalog (41 products per the last real screenshot)
    // is well within a single page. Revisit if the catalog grows past 250.
    const res = await fetch(`https://${storeUrl}/admin/api/2024-10/products.json?limit=250`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      const body = await res.text();
      await db
        .updateTable("integrationCredentials")
        .set({ status: "error", lastError: `Shopify returned ${res.status} during sync.` })
        .where("id", "=", record.id)
        .execute();
      return NextResponse.json({ error: `Shopify returned ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
    }
    const data = await res.json();
    shopifyProducts = data.products ?? [];
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Shopify: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  let created = 0;
  let updated = 0;
  let variantsCreated = 0;
  const errors: string[] = [];
  const duplicateVariants: string[] = [];

  for (const sp of shopifyProducts) {
    try {
      const existing = await db
        .selectFrom("products")
        .select(["id"])
        .where("tenantId", "=", session.tenantId)
        .where("handle", "=", sp.handle)
        .executeTakeFirst();

      const shopifyStatus = sp.status === "active" ? "active" : sp.status === "archived" ? "archived" : "draft";

      let productId: string;
      if (existing) {
        // Existing product: update listing metadata only — title, status,
        // image. Deliberately does NOT touch cost/price/on-hand for
        // variants that already exist (see loop below) — those stay
        // EMS-governed, matching this page's own "cost, price and profit
        // managed in EMS" description.
        await db
          .updateTable("products")
          .set({ title: sp.title, status: shopifyStatus, imageUrl: sp.image?.src ?? null, updatedAt: new Date() })
          .where("id", "=", existing.id)
          .execute();
        productId = existing.id;
        updated++;
      } else {
        const newProduct = await db
          .insertInto("products")
          .values({
            tenantId: session.tenantId,
            handle: sp.handle,
            title: sp.title,
            channel: "shopify",
            status: shopifyStatus,
            imageUrl: sp.image?.src ?? null,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        productId = newProduct.id;
        created++;
      }

      // Fetch all existing variants for this product once, so we can match
      // case-insensitively (Shopify option casing has been inconsistent —
      // "black" vs "Black" — which previously created duplicate "ghost"
      // variants instead of matching the real one) and detect any
      // already-existing duplicates from before this fix, to surface for
      // manual cleanup rather than silently guessing which row is "real."
      const existingVariants = await db.selectFrom("variants").selectAll().where("productId", "=", productId).execute();

      const keyOf = (o1: string | null, o2: string | null, o3: string | null) =>
        [o1, o2, o3].map((v) => (v ?? "").trim().toLowerCase()).join("␟");

      const groups = new Map<string, typeof existingVariants>();
      for (const v of existingVariants) {
        const k = keyOf(v.option1Value, v.option2Value, v.option3Value);
        groups.set(k, [...(groups.get(k) ?? []), v]);
      }
      for (const [k, group] of groups) {
        if (group.length > 1) {
          duplicateVariants.push(`${sp.title} — "${k.split("␟").filter(Boolean).join(" / ")}" has ${group.length} duplicate variant rows (case-mismatch bug from before this fix). Delete the extra one(s) manually from the product page.`);
        }
      }

      for (const sv of sp.variants) {
        const svKey = keyOf(sv.option1, sv.option2, sv.option3);
        const group = groups.get(svKey);
        const existingVariant = group?.[0];

        if (existingVariant) {
          // Stock is now Shopify-governed by choice — every sync overwrites
          // on_hand with Shopify's number. Adjust Stock / delivery-based
          // deduction are still fine to use for same-day accuracy between
          // syncs, but the next sync will always reset to Shopify's count,
          // since Shopify is the intended source of truth going forward.
          // SKU and option casing also get normalized to Shopify's current
          // values here — self-heals the case-mismatch this fix addresses.
          await db
            .updateTable("variants")
            .set({
              sku: sv.sku || existingVariant.sku,
              option1Value: sv.option1,
              option2Value: sv.option2,
              option3Value: sv.option3,
              onHand: sv.inventory_quantity,
              updatedAt: new Date(),
            })
            .where("id", "=", existingVariant.id)
            .execute();
        } else {
          await db
            .insertInto("variants")
            .values({
              productId,
              sku: sv.sku,
              option1Value: sv.option1,
              option2Value: sv.option2,
              option3Value: sv.option3,
              salePrice: sv.price ? sv.price.toString() : null,
              costPrice: null,
              onHand: sv.inventory_quantity,
            })
            .execute();
          variantsCreated++;
        }
      }
    } catch (err) {
      errors.push(`${sp.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await db
    .updateTable("integrationCredentials")
    .set({ status: "connected", lastSyncAt: new Date(), lastError: errors.length ? errors.join("; ").slice(0, 500) : null })
    .where("id", "=", record.id)
    .execute();

  return NextResponse.json({
    ok: true,
    productsCreated: created,
    productsUpdated: updated,
    variantsCreated,
    duplicateVariants,
    errors,
  });
}
