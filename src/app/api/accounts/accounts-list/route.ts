import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const accounts = await db
    .selectFrom("accounts")
    .select(["id", "name", "type"])
    .where("tenantId", "=", session.tenantId)
    .orderBy("name")
    .execute();

  return NextResponse.json({ accounts });
}
