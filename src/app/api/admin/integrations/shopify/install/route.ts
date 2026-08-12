import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getSession } from "@/lib/require-session";

// Dev Dashboard / OAuth-model Shopify apps don't hand you a copy-pasteable
// static Admin API token anywhere in the UI — the only way to get a real
// access token is to actually run the OAuth dance: send the merchant here,
// they approve on Shopify, Shopify redirects back to our callback with a
// one-time code that we exchange server-side for the real token.
//
// Scopes requested must exactly match (or be a subset of) what's configured
// for this app in Shopify's Dev Dashboard — see SHOPIFY_SETUP.md.
const SHOPIFY_SCOPES = "read_products,write_products";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const storeUrl = req.nextUrl.searchParams.get("storeUrl")?.trim();
  if (!storeUrl || !storeUrl.endsWith(".myshopify.com")) {
    return NextResponse.json(
      { error: 'Store URL should look like "your-store.myshopify.com".' },
      { status: 400 }
    );
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const secret = process.env.JWT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !secret || !appUrl) {
    return NextResponse.json(
      { error: "SHOPIFY_CLIENT_ID, APP_URL, and JWT_SECRET must all be set on the server before connecting Shopify." },
      { status: 500 }
    );
  }

  // Short-lived signed state — carries which tenant/store this install is
  // for through the OAuth round trip, and lets the callback verify the
  // redirect actually originated from an install we initiated (CSRF guard).
  const state = jwt.sign({ tenantId: session.tenantId, storeUrl }, secret, { expiresIn: "10m" });

  // Deliberately NOT built from req.nextUrl.origin: behind Railway's proxy
  // that can resolve to "localhost", which Shopify then rejects as an
  // unwhitelisted redirect_uri. APP_URL is the one source of truth for
  // this, and must exactly match what's in the Shopify app's "Redirect
  // URLs" field.
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/admin/integrations/shopify/callback`;

  const authorizeUrl = new URL(`https://${storeUrl}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SHOPIFY_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl.toString());
}
