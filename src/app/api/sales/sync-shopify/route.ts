import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { syncShopifyOrders } from "@/lib/shopify-orders-sync";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const result = await syncShopifyOrders(session.tenantId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
