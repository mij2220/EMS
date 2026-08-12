import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/db";
import { encryptSecret } from "@/lib/crypto";

interface OAuthState {
  tenantId: string;
  storeUrl: string;
}

function redirectToAdmin(origin: string, status: "connected" | "error", detail?: string) {
  const url = new URL("/dashboard/admin", origin);
  url.searchParams.set("shopify", status);
  if (detail) url.searchParams.set("detail", detail);
  return NextResponse.redirect(url.toString());
}

// Verifies the request actually came from Shopify, per Shopify's documented
// OAuth callback verification: HMAC-SHA256 over the sorted, unescaped query
// string (excluding hmac and signature) using the app's client secret.
function verifyHmac(searchParams: URLSearchParams, secret: string): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const shop = params.get("shop");
  const state = params.get("state");

  const secret = process.env.JWT_SECRET;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!secret || !clientId || !clientSecret) {
    return redirectToAdmin(origin, "error", "Server is missing SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET.");
  }
  if (!code || !shop || !state) {
    return redirectToAdmin(origin, "error", "Shopify's redirect was missing required parameters.");
  }

  // 1. Verify this really came from Shopify.
  if (!verifyHmac(params, clientSecret)) {
    return redirectToAdmin(origin, "error", "Could not verify the request came from Shopify (HMAC mismatch).");
  }

  // 2. Verify the state we signed on the way out, and recover which
  // tenant/store this install belongs to.
  let decoded: OAuthState;
  try {
    decoded = jwt.verify(state, secret) as unknown as OAuthState;
  } catch {
    return redirectToAdmin(origin, "error", "This connection link expired or was invalid — try connecting again.");
  }
  if (decoded.storeUrl !== shop) {
    return redirectToAdmin(origin, "error", "Store mismatch between the request and Shopify's redirect.");
  }

  // 3. Exchange the one-time code for a real, long-lived Admin API access token.
  let accessToken: string;
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      return redirectToAdmin(origin, "error", `Shopify rejected the code exchange (HTTP ${tokenRes.status}): ${text.slice(0, 200)}`);
    }
    const tokenData = await tokenRes.json();
    accessToken = tokenData?.access_token;
    if (!accessToken) {
      return redirectToAdmin(origin, "error", "Shopify's response didn't include an access token.");
    }
  } catch (e) {
    return redirectToAdmin(origin, "error", e instanceof Error ? e.message : "Could not reach Shopify to exchange the code.");
  }

  // 4. Store it, encrypted — same table/column the manual-entry flow used,
  // so Test Connection / Sync keep working unchanged.
  const encrypted = encryptSecret(accessToken);
  const existing = await db
    .selectFrom("integrationCredentials")
    .select("id")
    .where("tenantId", "=", decoded.tenantId)
    .where("provider", "=", "shopify")
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("integrationCredentials")
      .set({ storeUrl: shop, credentialsEncrypted: encrypted, status: "disconnected", lastError: null })
      .where("id", "=", existing.id)
      .execute();
  } else {
    await db
      .insertInto("integrationCredentials")
      .values({ tenantId: decoded.tenantId, provider: "shopify", storeUrl: shop, credentialsEncrypted: encrypted, status: "disconnected" })
      .execute();
  }

  return redirectToAdmin(origin, "connected");
}
