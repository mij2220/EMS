import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await db
    .selectFrom("users")
    .innerJoin("roles", "roles.id", "users.roleId")
    .innerJoin("tenants", "tenants.id", "users.tenantId")
    .select([
      "users.id",
      "users.name",
      "users.email",
      "roles.name as roleName",
      "tenants.businessName as tenantName",
    ])
    .where("users.id", "=", session.userId)
    .executeTakeFirst();

  if (!user) {
    return NextResponse.json({ error: "User no longer exists." }, { status: 401 });
  }

  return NextResponse.json({ user });
}
