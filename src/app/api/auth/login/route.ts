import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { verifyPassword, signSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", email)
    .where("status", "!=", "deactivated")
    .executeTakeFirst();

  if (!user) {
    // Same message whether the email doesn't exist or the password is wrong —
    // never reveal which one, so this can't be used to enumerate valid emails.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = signSession({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roleId: user.roleId,
  });

  await db
    .updateTable("users")
    .set({ lastLoginAt: new Date(), status: "active" })
    .where("id", "=", user.id)
    .execute();

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days, matches JWT expiry
  });
  return res;
}
