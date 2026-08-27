import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { isOwner } from "@/lib/require-owner";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await isOwner(session))) return NextResponse.json({ error: "Only the Owner role can download database backups." }, { status: 403 });

  const { id } = await params;
  const backup = await db.selectFrom("dbBackups").select(["content", "createdAt"]).where("id", "=", id).executeTakeFirst();
  if (!backup) return NextResponse.json({ error: "Backup not found." }, { status: 404 });

  const filename = `ems-backup-${new Date(backup.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  return new NextResponse(new Uint8Array(backup.content), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
