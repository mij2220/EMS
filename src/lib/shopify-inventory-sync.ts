import { db } from "@/db";
import { decryptSecret } from "@/lib/crypto";

type ShopifyVariant = {
  sku: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: string;
  inventory_quantity: number;
  inventory_item_id: number | null;
};
type ShopifyProduct = {
  id: number;
  handle: string;
  title: string;
  status: string; // 'active' | 'draft' | 'archived'
  image: { src: string } | null;
  variants: ShopifyVariant[];
};

export type InventorySyncResult = {
  ok: boolean;
  error?: string;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  costsBackfilled: number;
  duplicateVariants: string[];
  errors: string[];
};

/**
 * Shopify's /products.json endpoint never includes cost — cost-per-item
 * lives on a separate InventoryItem resource. This fetches it in batches
 * (Shopify allows up to 250 ids per call) keyed by inventory_item_id so the
 * sync loop can look costs up by variant without a request-per-variant.
 * Returns an empty map (not a throw) on any failure — cost is a nice-to-have
 * backfill, and a failure here should never abort the rest of the sync.
 */
async function fetchInventoryItemCosts(
  storeUrl: string,
  accessToken: string,
  inventoryItemIds: number[]
): Promise<Map<number, string | null>> {
  const costById = new Map<number, string | null>();
  const ids = [...new Set(inventoryItemIds)];
  for (let i = 0; i < ids.length; i += 250) {
    const batch = ids.slice(i, i + 250);
    try {
      const res = await fetch(
        `https://${storeUrl}/admin/api/2024-10/inventory_items.json?ids=${batch.join(",")}&limit=250`,
        { headers: { "X-Shopify-Access-Token": accessToken } }
      );
      if (!res.ok) continue; // best-effort — cost stays unset for this batch, not a sync failure
      const data = await res.json();
      const items: { id: number; cost: string | null }[] = data.inventory_items ?? [];
      for (const item of items) costById.set(item.id, item.cost ?? null);
    } catch {
      // network hiccup on the cost lookup shouldn't fail the whole sync
    }
  }
  return costById;
}

/**
 * Pulls the tenant's Shopify catalog and upserts it into products/variants.
 * Shared by the manual "Sync with Shopify" button (see
 * /api/inventory/sync-shopify) and the hourly scheduler (see
 * instrumentation.ts) — keep both call sites behind this single function so
 * they can never drift apart.
 */
export async function syncShopifyInventory(tenantId: string): Promise<InventorySyncResult> {
  const empty = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, costsBackfilled: 0, duplicateVariants: [], errors: [] };

  const record = await db
    .selectFrom("integrationCredentials")
    .select(["id", "storeUrl", "credentialsEncrypted", "status"])
    .where("tenantId", "=", tenantId)
    .where("provider", "=", "shopify")
    .executeTakeFirst();

  if (!record || !record.credentialsEncrypted || !record.storeUrl) {
    return { ok: false, error: "Shopify not connected.", ...empty };
  }
  if (record.status !== "connected") {
    return { ok: false, error: "Shopify connection not confirmed working (Test Connection required).", ...empty };
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
      return { ok: false, error: `Shopify returned ${res.status}: ${body.slice(0, 300)}`, ...empty };
    }
    const data = await res.json();
    shopifyProducts = data.products ?? [];
  } catch (err) {
    return { ok: false, error: `Could not reach Shopify: ${err instanceof Error ? err.message : String(err)}`, ...empty };
  }

  // Best-effort cost lookup, fetched once up front for every variant in
  // this catalog (not per-product inside the loop) to keep this to a
  // handful of requests instead of one per variant. See the "Deliberate
  // design decision" comment below for why this only ever fills in a
  // missing cost, never overwrites one EMS already has.
  const inventoryItemIds = shopifyProducts.flatMap((sp) => sp.variants.map((v) => v.inventory_item_id).filter((id): id is number => id != null));
  const costByInventoryItemId = await fetchInventoryItemCosts(storeUrl, accessToken, inventoryItemIds);

  let created = 0;
  let updated = 0;
  let variantsCreated = 0;
  let costsBackfilled = 0;
  const errors: string[] = [];
  const duplicateVariants: string[] = [];

  for (const sp of shopifyProducts) {
    try {
      const existing = await db
        .selectFrom("products")
        .select(["id"])
        .where("tenantId", "=", tenantId)
        .where("handle", "=", sp.handle)
        .executeTakeFirst();

      const shopifyStatus = sp.status === "active" ? "active" : sp.status === "archived" ? "archived" : "draft";

      let productId: string;
      if (existing) {
        // Existing product: update listing metadata only — title, status,
        // image. Deliberately does NOT touch cost/price for variants that
        // already exist (see loop below) — those stay EMS-governed, matching
        // this page's own "cost, price and profit managed in EMS"
        // description. on_hand is the one exception — see below.
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
            tenantId,
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
          duplicateVariants.push(
            `${sp.title} — "${k.split("␟").filter(Boolean).join(" / ")}" has ${group.length} duplicate variant rows (case-mismatch bug from before this fix). Use "Clean Up Duplicates" or delete the extra one(s) manually.`
          );
        }
      }

      for (const sv of sp.variants) {
        const svKey = keyOf(sv.option1, sv.option2, sv.option3);
        const group = groups.get(svKey);
        const existingVariant = group?.[0];

        // Shopify's InventoryItem.cost is a plain string like "172.00" or
        // null if the merchant never entered a "Cost per item" value for
        // this variant in Shopify — treat both "not in the map" and an
        // explicit null the same way (nothing to backfill from).
        const shopifyCost = sv.inventory_item_id != null ? costByInventoryItemId.get(sv.inventory_item_id) : null;

        if (existingVariant) {
          // Stock is Shopify-governed by choice — every sync overwrites
          // on_hand with Shopify's number. Adjust Stock / delivery-based
          // deduction are still fine to use for same-day accuracy between
          // syncs, but the next sync (including this hourly one) always
          // resets to Shopify's count, since Shopify is the source of truth.
          // SKU and option casing also get normalized to Shopify's current
          // values here — self-heals the case-mismatch bug.
          //
          // Cost is the one deliberate exception to "never touch cost on an
          // existing variant": if EMS has never had a cost for this variant
          // (cost_price is null — nobody's entered one, and no prior sync
          // ever backfilled it), and Shopify now has one, fill it in once.
          // Once cost_price is non-null here, no future sync ever touches
          // it again — EMS remains the source of truth from that point on,
          // matching this page's own "cost, price and profit managed in
          // EMS" description.
          const shouldBackfillCost = existingVariant.costPrice == null && shopifyCost != null;
          if (shouldBackfillCost) costsBackfilled++;

          await db
            .updateTable("variants")
            .set({
              sku: sv.sku || existingVariant.sku,
              option1Value: sv.option1,
              option2Value: sv.option2,
              option3Value: sv.option3,
              onHand: sv.inventory_quantity,
              ...(shouldBackfillCost ? { costPrice: shopifyCost } : {}),
              updatedAt: new Date(),
            })
            .where("id", "=", existingVariant.id)
            .execute();
        } else {
          if (shopifyCost != null) costsBackfilled++;
          await db
            .insertInto("variants")
            .values({
              productId,
              sku: sv.sku,
              option1Value: sv.option1,
              option2Value: sv.option2,
              option3Value: sv.option3,
              salePrice: sv.price ? sv.price.toString() : null,
              costPrice: shopifyCost,
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

  return { ok: true, productsCreated: created, productsUpdated: updated, variantsCreated, costsBackfilled, duplicateVariants, errors };
}
