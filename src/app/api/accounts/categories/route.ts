import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const categories = await db
    .selectFrom("expenseCategories")
    .select(["id", "name", "status", "createdAt"])
    .where("tenantId", "=", session.tenantId)
    .orderBy("name")
    .execute();

  const subcategories = await db
    .selectFrom("expenseSubcategories")
    .select(["id", "categoryId", "name", "status", "createdAt"])
    .where("tenantId", "=", session.tenantId)
    .orderBy("name")
    .execute();

  const result = categories.map((c) => ({
    ...c,
    subcategories: subcategories.filter((s) => s.categoryId === c.id),
  }));

  return NextResponse.json({ categories: result });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const existing = await db
    .selectFrom("expenseCategories")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (existing) return NextResponse.json({ error: `"${name}" already exists.` }, { status: 409 });

  const category = await db
    .insertInto("expenseCategories")
    .values({ tenantId: session.tenantId, name })
    .returning(["id", "name"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, category }, { status: 201 });
}
