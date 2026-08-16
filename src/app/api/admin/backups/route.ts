import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { isOwner } from "@/lib/require-owner";
import { createBackup } from "@/lib/db-backup";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await isOwner(session))) return NextResponse.json({ error: "Only the Owner role can view database backups." }, { status: 403 });

  // Deliberately no `content` column in this select — that's the full
  // multi-megabyte dump, only fetched by the dedicated download route.
  const backups = await db
    .selectFrom("dbBackups")
    .leftJoin("users", "users.id", "dbBackups.createdByUserId")
    .select(["dbBackups.id", "dbBackups.createdAt", "dbBackups.sizeBytes", "dbBackups.isPreRestoreSnapshot", "users.name as createdByName"])
    .orderBy("dbBackups.createdAt", "desc")
    .execute();

  return NextResponse.json({ backups: backups.map((b) => ({ ...b, sizeBytes: Number(b.sizeBytes) })) });
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await isOwner(session))) return NextResponse.json({ error: "Only the Owner role can create database backups." }, { status: 403 });

  try {
    const result = await createBackup(session.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Backup failed." }, { status: 500 });
  }
}
