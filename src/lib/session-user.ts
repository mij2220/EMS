import { redirect } from "next/navigation";
import { db } from "@/db";
import type { SessionPayload } from "./auth";

/**
 * Every dashboard page needs the logged-in user's name + tenant name for the
 * shell. This centralizes that lookup — and, importantly, handles the case
 * where the session's JWT is still validly signed but points at a user that
 * no longer exists (e.g. the database was reset while someone was still
 * logged in, which happens constantly in local dev). Previously every page
 * did this query inline with executeTakeFirstOrThrow(), which crashed with
 * an unhandled "no result" error in that situation instead of just sending
 * the person back to /login to sign in again.
 */
export async function getSessionUser(session: SessionPayload) {
  const user = await db
    .selectFrom("users")
    .innerJoin("tenants", "tenants.id", "users.tenantId")
    .select(["users.id", "users.name", "tenants.businessName as tenantName"])
    .where("users.id", "=", session.userId)
    .executeTakeFirst();

  if (!user) {
    // Stale session — the referenced user no longer exists. Send them back
    // to log in fresh; a successful login overwrites the stale cookie.
    redirect("/login");
  }

  return user;
}
