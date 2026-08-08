import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { encryptSecret } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const integrations = await db
    .selectFrom("integrationCredentials")
    .select(["id", "provider", "storeUrl", "status", "lastSyncAt", "lastError"])
    .where("tenantId", "=", session.tenantId)
    .execute();

  // Deliberately no credentialsEncrypted field in the select above — never
  // sent to the client, decrypted or not.
  return NextResponse.json({ integrations });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const provider = body?.provider?.trim();
  const storeUrl = body?.storeUrl?.trim();
  const accessToken = body?.accessToken?.trim();

  if (!provider || !storeUrl || !accessToken) {
    return NextResponse.json({ error: "provider, storeUrl, and accessToken are all required." }, { status: 400 });
  }
  if (provider === "shopify" && !storeUrl.endsWith(".myshopify.com")) {
    return NextResponse.json(
      { error: 'Shopify store URL should look like "your-store.myshopify.com" — this is different from a custom domain like aimexa.store.' },
      { status: 400 }
    );
  }

  const encrypted = encryptSecret(accessToken);

  const existing = await db
    .selectFrom("integrationCredentials")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("provider", "=", provider)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("integrationCredentials")
      .set({ storeUrl, credentialsEncrypted: encrypted, status: "disconnected", lastError: null })
      .where("id", "=", existing.id)
      .execute();
  } else {
    await db
      .insertInto("integrationCredentials")
      .values({ tenantId: session.tenantId, provider, storeUrl, credentialsEncrypted: encrypted, status: "disconnected" })
      .execute();
  }

  return NextResponse.json({ ok: true });
}
