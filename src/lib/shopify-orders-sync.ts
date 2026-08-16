import { db } from "@/db";
import { decryptSecret } from "@/lib/crypto";

type ShopifyLineItem = {
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
};
type ShopifyFulfillment = {
  tracking_number: string | null;
  tracking_company: string | null;
};
type ShopifyAddress = { name: string | null; phone: string | null; city: string | null } | null;
type ShopifyOrder = {
  id: number;
  name: string; // e.g. "#1051"
  created_at: string;
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  payment_gateway_names: string[];
  customer: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  shipping_address: ShopifyAddress;
  line_items: ShopifyLineItem[];
  fulfillments: ShopifyFulfillment[];
};

export type SalesSyncResult = {
  ok: boolean;
  error?: string;
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  unmatchedItems: string[];
  errors: string[];
};

// Deliberately conservative: Shopify's "fulfilled" means a shipping label
// exists, not that a courier actually delivered it. Only "pending" and
// "dispatched" are ever set here — "delivered" and "returned" stay
// exclusively EMS-driven (Mark Delivered / Mark Returned), matching the
// existing rule that on-hand only changes via those two actions. Syncing a
// fake "delivered" from Shopify would silently deduct stock without anyone
// having actually confirmed delivery.
function mapStatus(so: ShopifyOrder): string {
  if (so.fulfillment_status === "fulfilled" || so.fulfillment_status === "partial") return "dispatched";
  return "pending";
}

function guessPaymentType(so: ShopifyOrder): string {
  const gateways = (so.payment_gateway_names ?? []).join(" ").toLowerCase();
  if (gateways.includes("cash on delivery") || gateways.includes("cod")) return "COD";
  return "Prepaid";
}

async function matchAndInsertLineItems(
  tenantId: string,
  orderId: string,
  orderNumber: string,
  lineItems: ShopifyLineItem[],
  unmatchedItems: string[]
): Promise<number> {
  // Line items: Shopify's order line items don't include the product
  // handle — only title and variant_title (e.g. "Blue / Large"). Match
  // against EMS's products/variants by title + parsed option values,
  // the closest equivalent to the handle+option matching the product
  // sync already uses, given SKU is missing store-wide.
  let inserted = 0;
  for (const li of lineItems) {
    const [opt1, opt2] = (li.variant_title ?? "").split(" / ").map((s) => s.trim() || null);

    const product = await db
      .selectFrom("products")
      .select(["id"])
      .where("tenantId", "=", tenantId)
      .where("title", "=", li.title)
      .executeTakeFirst();

    const variant = product
      ? await db
          .selectFrom("variants")
          .select(["id", "costPrice"])
          .where("productId", "=", product.id)
          .where((eb) => eb.and([eb("option1Value", "=", opt1), eb("option2Value", "=", opt2)]))
          .executeTakeFirst()
      : undefined;

    if (!variant) {
      unmatchedItems.push(`${orderNumber}: "${li.title}" (${li.variant_title ?? "no variant"})`);
      continue;
    }

    await db
      .insertInto("orderItems")
      .values({
        orderId,
        variantId: variant.id,
        qty: li.quantity,
        unitPrice: li.price,
        unitCost: variant.costPrice ?? "0",
      })
      .execute();
    inserted++;
  }
  return inserted;
}

/**
 * Pulls the tenant's Shopify orders and upserts them into orders/orderItems
 * (plus customers/couriers as needed). Shared by the manual "Sync Sales"
 * button (see /api/sales/sync-shopify) and the hourly scheduler (see
 * instrumentation.ts) — keep both call sites behind this single function so
 * they can never drift apart.
 */
export async function syncShopifyOrders(tenantId: string): Promise<SalesSyncResult> {
  const empty = { ordersCreated: 0, ordersUpdated: 0, ordersSkipped: 0, unmatchedItems: [], errors: [] };

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

  let shopifyOrders: ShopifyOrder[];
  try {
    // Same 250-item cap/no-pagination caveat as the product sync — revisit
    // if order volume grows past a single page.
    const res = await fetch(`https://${storeUrl}/admin/api/2024-10/orders.json?status=any&limit=250`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Shopify returned ${res.status}: ${body.slice(0, 300)}`, ...empty };
    }
    const data = await res.json();
    shopifyOrders = data.orders ?? [];
  } catch (err) {
    return { ok: false, error: `Could not reach Shopify: ${err instanceof Error ? err.message : String(err)}`, ...empty };
  }

  let ordersCreated = 0;
  let ordersSkipped = 0;
  let ordersUpdated = 0;
  const errors: string[] = [];
  const unmatchedItems: string[] = [];

  for (const so of shopifyOrders) {
    try {
      // Shopify's order.name already includes a leading "#" (e.g. "#1051").
      // EMS's own orderNumber values never do — the UI prepends "#" itself
      // when rendering. Strip it here so synced orders don't end up
      // displaying "##1051".
      const orderNumber = so.name.replace(/^#/, "");

      const existingOrder = await db
        .selectFrom("orders")
        .select(["id", "status"])
        .where("tenantId", "=", tenantId)
        // Matches both the clean form going forward and the "#"-prefixed
        // form a prior version of this sync stored, so re-running this
        // after the fix updates those rows in place instead of creating
        // duplicates.
        .where((eb) => eb.or([eb("orderNumber", "=", orderNumber), eb("orderNumber", "=", so.name)]))
        .executeTakeFirst();

      const firstFulfillment = so.fulfillments?.[0];

      if (existingOrder) {
        let changed = false;

        // Never touch status here if EMS has already moved it past what
        // Shopify sync would set (e.g. someone already marked it Delivered
        // or Returned by hand) — only ever refresh tracking info, which is
        // harmless to overwrite.
        if (existingOrder.status === "pending" || existingOrder.status === "dispatched") {
          await db
            .updateTable("orders")
            .set({
              status: mapStatus(so),
              trackingNumber: firstFulfillment?.tracking_number ?? null,
              orderNumber, // normalizes legacy rows stored with a leading "#"
            })
            .where("id", "=", existingOrder.id)
            .execute();
          changed = true;
        } else {
          // Status is locked in (delivered/returned), but still normalize a
          // legacy "#"-prefixed orderNumber if that's what's stored, so the
          // double-"#" display bug gets fixed regardless of status.
          const current = await db.selectFrom("orders").select(["orderNumber"]).where("id", "=", existingOrder.id).executeTakeFirstOrThrow();
          if (current.orderNumber !== orderNumber) {
            await db.updateTable("orders").set({ orderNumber }).where("id", "=", existingOrder.id).execute();
            changed = true;
          }
        }

        // Backfill line items only if this order genuinely has none yet —
        // covers orders that pre-existed (e.g. from seed data) with the
        // right order number but no items attached. Never touches an order
        // that already has at least one item, so real data is never
        // duplicated or overwritten. Safe to do even for delivered/returned
        // orders — it only adds reporting data (qty/price), it doesn't
        // touch status or stock (only Mark Delivered/Returned do that).
        const itemCount = await db
          .selectFrom("orderItems")
          .select(({ fn }) => [fn.count<string>("id").as("count")])
          .where("orderId", "=", existingOrder.id)
          .executeTakeFirst();
        if (Number(itemCount?.count ?? 0) === 0) {
          const n = await matchAndInsertLineItems(tenantId, existingOrder.id, orderNumber, so.line_items, unmatchedItems);
          if (n > 0) changed = true;
        }

        if (changed) ordersUpdated++;
        else ordersSkipped++;
        continue;
      }

      // Customer: match by phone (the one stable identifier EMS's customers
      // table has), create if new.
      const phone = so.shipping_address?.phone ?? so.customer?.phone ?? "";
      const customerName =
        so.shipping_address?.name ??
        [so.customer?.first_name, so.customer?.last_name].filter(Boolean).join(" ") ??
        "Shopify Customer";

      let customerId: string;
      const existingCustomer = phone
        ? await db
            .selectFrom("customers")
            .select(["id"])
            .where("tenantId", "=", tenantId)
            .where("phone", "=", phone)
            .executeTakeFirst()
        : undefined;

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const newCustomer = await db
          .insertInto("customers")
          .values({
            tenantId,
            name: customerName || "Shopify Customer",
            phone: phone || "unknown",
            city: so.shipping_address?.city ?? null,
            firstOrderAt: new Date(so.created_at),
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        customerId = newCustomer.id;
      }

      // Courier: only if Shopify actually recorded a shipping carrier.
      let courierId: string | null = null;
      if (firstFulfillment?.tracking_company) {
        const courierName = firstFulfillment.tracking_company;
        const existingCourier = await db
          .selectFrom("couriers")
          .select(["id"])
          .where("tenantId", "=", tenantId)
          .where("name", "=", courierName)
          .executeTakeFirst();
        courierId = existingCourier
          ? existingCourier.id
          : (
              await db
                .insertInto("couriers")
                .values({ tenantId, name: courierName })
                .returning("id")
                .executeTakeFirstOrThrow()
            ).id;
      }

      const newOrder = await db
        .insertInto("orders")
        .values({
          tenantId,
          customerId,
          courierId,
          orderNumber,
          status: mapStatus(so),
          paymentType: guessPaymentType(so),
          source: "shopify_sync",
          trackingNumber: firstFulfillment?.tracking_number ?? null,
          placedAt: new Date(so.created_at),
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      // Line items — see matchAndInsertLineItems for the matching approach.
      await matchAndInsertLineItems(tenantId, newOrder.id, orderNumber, so.line_items, unmatchedItems);

      ordersCreated++;
    } catch (err) {
      errors.push(`${so.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: true, ordersCreated, ordersUpdated, ordersSkipped, unmatchedItems, errors };
}
