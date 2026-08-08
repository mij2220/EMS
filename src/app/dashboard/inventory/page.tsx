import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import { db } from "@/db";
import { sql } from "kysely";
import InventoryClient from "./inventory-client";

async function getSessionOrRedirect() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) redirect("/login");
  return session;
}

export default async function InventoryPage() {
  const session = await getSessionOrRedirect();

  const user = await getSessionUser(session);

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
    .groupBy(["products.id", "products.handle", "products.title", "products.status", "products.imageUrl"])
    .orderBy("products.title")
    .execute();

  const serialized = products.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    status: p.status,
    imageUrl: p.imageUrl,
    variantCount: Number(p.variantCount),
    totalOnHand: Number(p.totalOnHand),
    minPrice: p.minPrice != null ? Number(p.minPrice) : null,
    maxPrice: p.maxPrice != null ? Number(p.maxPrice) : null,
    minCost: p.minCost != null ? Number(p.minCost) : null,
    maxCost: p.maxCost != null ? Number(p.maxCost) : null,
    hasMissingSku: Number(p.missingSkuCount) > 0,
    locationNames: (p.locationNames ?? []).filter((n): n is string => n != null),
  }));

  const locations = [...new Set(serialized.flatMap((p) => p.locationNames))].sort();

  return (
    <InventoryClient
      initialProducts={serialized}
      locations={locations}
      tenantName={user.tenantName}
      userInitial={user.name.charAt(0).toUpperCase()}
    />
  );
}
