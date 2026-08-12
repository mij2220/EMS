import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
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

  let shopifyOrders: ShopifyOrder[];
  try {
    // Same 250-item cap/no-pagination caveat as the product sync — revisit
    // if order volume grows past a single page.
    const res = await fetch(`https://${storeUrl}/admin/api/2024-10/orders.json?status=any&limit=250`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: `Shopify returned ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
    }
    const data = await res.json();
    shopifyOrders = data.orders ?? [];
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Shopify: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  let ordersCreated = 0;
  let ordersSkipped = 0;
  let ordersUpdated = 0;
  const errors: string[] = [];
  const unmatchedItems: string[] = [];

  for (const so of shopifyOrders) {
    try {
      const orderNumber = so.name;

      const existingOrder = await db
        .selectFrom("orders")
        .select(["id", "status"])
        .where("tenantId", "=", session.tenantId)
        .where("orderNumber", "=", orderNumber)
        .executeTakeFirst();

      const firstFulfillment = so.fulfillments?.[0];

      if (existingOrder) {
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
            })
            .where("id", "=", existingOrder.id)
            .execute();
          ordersUpdated++;
        } else {
          ordersSkipped++;
        }
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
            .where("tenantId", "=", session.tenantId)
            .where("phone", "=", phone)
            .executeTakeFirst()
        : undefined;

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const newCustomer = await db
          .insertInto("customers")
          .values({
            tenantId: session.tenantId,
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
          .where("tenantId", "=", session.tenantId)
          .where("name", "=", courierName)
          .executeTakeFirst();
        courierId = existingCourier
          ? existingCourier.id
          : (
              await db
                .insertInto("couriers")
                .values({ tenantId: session.tenantId, name: courierName })
                .returning("id")
                .executeTakeFirstOrThrow()
            ).id;
      }

      const newOrder = await db
        .insertInto("orders")
        .values({
          tenantId: session.tenantId,
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

      // Line items: Shopify's order line items don't include the product
      // handle — only title and variant_title (e.g. "Blue / Large"). Match
      // against EMS's products/variants by title + parsed option values,
      // the closest equivalent to the handle+option matching the product
      // sync already uses, given SKU is missing store-wide.
      for (const li of so.line_items) {
        const [opt1, opt2] = (li.variant_title ?? "").split(" / ").map((s) => s.trim() || null);

        const product = await db
          .selectFrom("products")
          .select(["id"])
          .where("tenantId", "=", session.tenantId)
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
            orderId: newOrder.id,
            variantId: variant.id,
            qty: li.quantity,
            unitPrice: li.price,
            unitCost: variant.costPrice ?? "0",
          })
          .execute();
      }

      ordersCreated++;
    } catch (err) {
      errors.push(`${so.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    ordersCreated,
    ordersUpdated,
    ordersSkipped,
    unmatchedItems,
    errors,
  });
}
