import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import { db } from "@/db";
import ProductDetailClient from "./product-detail-client";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) redirect("/login");

  const user = await getSessionUser(session);

  const product = await db
    .selectFrom("products")
    .selectAll()
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!product) notFound();

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

  return (
    <ProductDetailClient
      product={product}
      tenantName={user.tenantName}
      userInitial={user.name.charAt(0).toUpperCase()}
      variants={variants.map((v) => ({
        ...v,
        costPrice: v.costPrice != null ? Number(v.costPrice) : null,
        salePrice: v.salePrice != null ? Number(v.salePrice) : null,
      }))}
    />
  );
}
