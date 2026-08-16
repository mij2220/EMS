import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import SalesReportsClient from "./sales-reports-client";

export default async function SalesReportsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) redirect("/login");

  const user = await getSessionUser(session);

  return <SalesReportsClient tenantName={user.tenantName} userInitial={user.name.charAt(0).toUpperCase()} />;
}
