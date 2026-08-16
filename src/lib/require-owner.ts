import { db } from "@/db";
import { SessionPayload } from "@/lib/auth";

/**
 * No route elsewhere in EMS currently gates by role — the permission matrix
 * exists on the mockup but isn't wired to real enforcement yet (every
 * authenticated session currently has full access). Database backup and
 * especially restore are high enough stakes (a backup contains the entire
 * database including customer PII; a bad restore could wipe live data) to
 * warrant a real check specifically here, ahead of the general permission
 * system being built out.
 */
export async function isOwner(session: SessionPayload): Promise<boolean> {
  const role = await db.selectFrom("roles").select(["name"]).where("id", "=", session.roleId).executeTakeFirst();
  return !!role && role.name.toLowerCase().includes("owner");
}
