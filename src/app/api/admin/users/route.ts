import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const users = await db
    .selectFrom("users")
    .innerJoin("roles", "roles.id", "users.roleId")
    .select(["users.id", "users.name", "users.email", "users.status", "users.twoFaEnabled", "users.lastLoginAt", "roles.name as roleName"])
    .where("users.tenantId", "=", session.tenantId)
    .orderBy("users.name")
    .execute();

  return NextResponse.json({ users });
}
