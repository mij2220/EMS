import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/db";
import EmployeeDetailClient from "./employee-detail-client";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return <EmployeeDetailClient employeeId={id} tenantName={user.tenantName} userInitial={user.name.charAt(0).toUpperCase()} />;
}
