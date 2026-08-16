import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { syncShopifyInventory } from "@/lib/shopify-inventory-sync";
import { logSyncRun } from "@/lib/sync-logs";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const startedAt = new Date();
  const result = await syncShopifyInventory(session.tenantId);
  await logSyncRun({
    tenantId: session.tenantId,
    provider: "shopify",
    syncType: "inventory",
    trigger: "manual",
    startedAt,
    ok: result.ok,
    summary: result,
    error: result.error,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
