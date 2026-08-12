import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/db";
import { encryptSecret } from "@/lib/crypto";

interface OAuthState {
  tenantId: string;
  storeUrl: string;
}

function redirectToAdmin(appUrl: string, status: "connected" | "error", detail?: string) {
  const url = new URL("/dashboard/admin", appUrl);
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
  console.log("[shopify-callback] hit:", req.nextUrl.toString());

  const appUrl = process.env.APP_URL;
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const shop = params.get("shop");
  const state = params.get("state");

  const secret = process.env.JWT_SECRET;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  // appUrl has no fallback here deliberately — without it we can't build a
  // reliable redirect back into EMS (see install/route.ts for why
  // req.nextUrl.origin isn't trustworthy behind Railway's proxy). If it's
  // missing, fail loudly in the response body rather than silently
  // redirecting somewhere broken.
  if (!appUrl) {
    console.error("[shopify-callback] APP_URL is not set");
    return NextResponse.json({ error: "APP_URL is not set on the server." }, { status: 500 });
  }
  if (!secret || !clientId || !clientSecret) {
    console.error("[shopify-callback] missing env vars", { hasSecret: !!secret, hasClientId: !!clientId, hasClientSecret: !!clientSecret });
    return redirectToAdmin(appUrl, "error", "Server is missing SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET.");
  }
  if (!code || !shop || !state) {
    console.error("[shopify-callback] missing query params", { hasCode: !!code, shop, hasState: !!state });
    return redirectToAdmin(appUrl, "error", "Shopify's redirect was missing required parameters.");
  }

  try {
    // 1. Verify this really came from Shopify.
    if (!verifyHmac(params, clientSecret)) {
      console.error("[shopify-callback] HMAC verification failed");
      return redirectToAdmin(appUrl, "error", "Could not verify the request came from Shopify (HMAC mismatch).");
    }
    console.log("[shopify-callback] HMAC ok");

    // 2. Verify the state we signed on the way out, and recover which
    // tenant/store this install belongs to.
    let decoded: OAuthState;
    try {
      decoded = jwt.verify(state, secret) as unknown as OAuthState;
    } catch (e) {
      console.error("[shopify-callback] state verify failed:", e instanceof Error ? e.message : e);
      return redirectToAdmin(appUrl, "error", "This connection link expired or was invalid — try connecting again.");
    }
    console.log("[shopify-callback] state ok, tenantId:", decoded.tenantId, "expectedShop:", decoded.storeUrl);
    if (decoded.storeUrl !== shop) {
      console.error("[shopify-callback] shop mismatch", { expected: decoded.storeUrl, actual: shop });
      return redirectToAdmin(appUrl, "error", `Shopify authorized a different store (${shop}) than requested (${decoded.storeUrl}).`);
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
      console.log("[shopify-callback] token exchange status:", tokenRes.status);
      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => "");
        console.error("[shopify-callback] token exchange rejected:", text.slice(0, 500));
        return redirectToAdmin(appUrl, "error", `Shopify rejected the code exchange (HTTP ${tokenRes.status}): ${text.slice(0, 200)}`);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData?.access_token;
      if (!accessToken) {
        console.error("[shopify-callback] no access_token in response:", JSON.stringify(tokenData).slice(0, 500));
        return redirectToAdmin(appUrl, "error", "Shopify's response didn't include an access token.");
      }
      console.log("[shopify-callback] got access token, length:", accessToken.length);
    } catch (e) {
      console.error("[shopify-callback] token exchange threw:", e instanceof Error ? e.stack : e);
      return redirectToAdmin(appUrl, "error", e instanceof Error ? e.message : "Could not reach Shopify to exchange the code.");
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
      console.log("[shopify-callback] updated existing credentials row:", existing.id);
    } else {
      await db
        .insertInto("integrationCredentials")
        .values({ tenantId: decoded.tenantId, provider: "shopify", storeUrl: shop, credentialsEncrypted: encrypted, status: "disconnected" })
        .execute();
      console.log("[shopify-callback] inserted new credentials row for tenant:", decoded.tenantId);
    }

    return redirectToAdmin(appUrl, "connected");
  } catch (e) {
    // Safety net: anything unexpected (e.g. a DB error) lands here instead
    // of Next.js serving a bare 500 page with no explanation.
    console.error("[shopify-callback] unexpected error:", e instanceof Error ? e.stack : e);
    return redirectToAdmin(appUrl, "error", e instanceof Error ? e.message : "Unexpected server error.");
  }
}
