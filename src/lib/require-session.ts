import { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE, SessionPayload } from "./auth";

/**
 * Every API route under /api/inventory (and later /api/sales, /api/accounts, etc.)
 * needs the same check: is there a valid session, and what tenant does it belong to.
 * Centralizing it here means that check — and any future change to it, like adding
 * per-module permission checks from the Admin module — only has to happen once.
 */
export function getSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
