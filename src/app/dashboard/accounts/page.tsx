import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/db";
import AccountsClient from "./accounts-client";

export default async function AccountsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) redirect("/login");

  const user = await db
    .selectFrom("users")
    .innerJoin("tenants", "tenants.id", "users.tenantId")
    .select(["users.name", "tenants.businessName as tenantName"])
    .where("users.id", "=", session.userId)
    .executeTakeFirstOrThrow();

  return <AccountsClient tenantName={user.tenantName} userInitial={user.name.charAt(0).toUpperCase()} />;
}
