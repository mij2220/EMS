import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { decryptSecret } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const provider = body?.provider?.trim();
  if (!provider) return NextResponse.json({ error: "provider is required." }, { status: 400 });

  const record = await db
    .selectFrom("integrationCredentials")
    .select(["id", "storeUrl", "credentialsEncrypted"])
    .where("tenantId", "=", session.tenantId)
    .where("provider", "=", provider)
    .executeTakeFirst();

  if (!record || !record.credentialsEncrypted || !record.storeUrl) {
    return NextResponse.json({ error: "No saved credentials for this provider yet." }, { status: 404 });
  }

  if (provider !== "shopify") {
    return NextResponse.json({ error: `Testing "${provider}" isn't implemented yet.` }, { status: 400 });
  }

  const accessToken = decryptSecret(record.credentialsEncrypted);

  try {
    // Shopify's real Admin REST API — GET /admin/api/{version}/shop.json is
    // the standard "am I actually connected" check, requiring only the
    // read scope every app has by default. Not tested live from this
    // sandbox (no network path to *.myshopify.com here) — built against
    // Shopify's documented API shape, first real test happens live.
    const res = await fetch(`https://${record.storeUrl}/admin/api/2024-10/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      const message =
        res.status === 401
          ? "Shopify rejected the access token — double check it was copied correctly and the app hasn't been uninstalled."
          : res.status === 404
          ? "Shopify couldn't find that store — double check the store URL is exactly right (yourstore.myshopify.com)."
          : `Shopify returned an error (HTTP ${res.status}): ${errorText.slice(0, 200)}`;

      await db
        .updateTable("integrationCredentials")
        .set({ status: "error", lastError: message })
        .where("id", "=", record.id)
        .execute();

      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const data = await res.json();
    const shopName = data?.shop?.name ?? "your store";

    await db
      .updateTable("integrationCredentials")
      .set({ status: "connected", lastError: null, lastSyncAt: new Date() })
      .where("id", "=", record.id)
      .execute();

    return NextResponse.json({ ok: true, shopName });
  } catch (e) {
    const message =
      e instanceof Error && e.name === "TimeoutError"
        ? "Shopify didn't respond within 10 seconds — check the store URL and your network connection."
        : `Could not reach Shopify: ${e instanceof Error ? e.message : "unknown error"}`;

    await db
      .updateTable("integrationCredentials")
      .set({ status: "error", lastError: message })
      .where("id", "=", record.id)
      .execute();

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
