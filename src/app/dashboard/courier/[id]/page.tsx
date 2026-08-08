import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import { db } from "@/db";
import CourierDetailClient from "./courier-detail-client";

export default async function CourierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) redirect("/login");

  const user = await getSessionUser(session);

  return <CourierDetailClient courierId={id} tenantName={user.tenantName} userInitial={user.name.charAt(0).toUpperCase()} />;
}
