import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const category = await db
    .selectFrom("expenseCategories")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const existing = await db
    .selectFrom("expenseSubcategories")
    .select("id")
    .where("categoryId", "=", id)
    .where("name", "=", name)
    .executeTakeFirst();
  if (existing) return NextResponse.json({ error: `"${name}" already exists under "${category.name}".` }, { status: 409 });

  const subcategory = await db
    .insertInto("expenseSubcategories")
    .values({ tenantId: session.tenantId, categoryId: id, name })
    .returning(["id", "name", "categoryId"])
    .executeTakeFirstOrThrow();

  return NextResponse.json({ ok: true, subcategory }, { status: 201 });
}
