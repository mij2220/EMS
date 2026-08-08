import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "No product IDs provided." }, { status: 400 });

  // Only ever touch products that actually belong to this tenant — a bulk
  // delete is exactly the kind of action where that check matters most.
  const owned = await db
    .selectFrom("products")
    .select(["id", "title"])
    .where("tenantId", "=", session.tenantId)
    .where("id", "in", ids)
    .execute();

  let deleted = 0;
  const blocked: string[] = [];

  for (const p of owned) {
    try {
      await db.deleteFrom("products").where("id", "=", p.id).execute();
      deleted++;
    } catch {
      // Same FK-constraint case as the single-delete route: a variant under
      // this product has stock-adjustment or order history and can't be
      // removed. Report it by name instead of silently skipping it.
      blocked.push(p.title);
    }
  }

  return NextResponse.json({ ok: true, deleted, blocked });
}
