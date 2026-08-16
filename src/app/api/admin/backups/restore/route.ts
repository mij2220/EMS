import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { isOwner } from "@/lib/require-owner";
import { createBackup, runPsqlRestore } from "@/lib/db-backup";

const CONFIRM_PHRASE = "RESTORE";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await isOwner(session))) return NextResponse.json({ error: "Only the Owner role can restore the database." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const confirmText = form.get("confirmText");
  if (confirmText !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Type "${CONFIRM_PHRASE}" exactly to confirm — nothing was touched.` }, { status: 400 });
  }

  const backupId = form.get("backupId");
  const file = form.get("file");

  let restoreContent: Buffer;
  if (typeof backupId === "string" && backupId) {
    const existing = await db.selectFrom("dbBackups").select(["content"]).where("id", "=", backupId).executeTakeFirst();
    if (!existing) return NextResponse.json({ error: "That backup no longer exists." }, { status: 404 });
    restoreContent = existing.content;
  } else if (file instanceof File) {
    if (!file.name.toLowerCase().endsWith(".sql")) {
      return NextResponse.json({ error: "Uploaded file must be a .sql dump (produced by pg_dump)." }, { status: 400 });
    }
    restoreContent = Buffer.from(await file.arrayBuffer());
  } else {
    return NextResponse.json({ error: "Provide either backupId (restore from a stored backup) or file (upload a .sql dump)." }, { status: 400 });
  }

  // Always take a fresh snapshot of the CURRENT live state immediately
  // before touching anything — this is the real safety net. If the
  // restore turns out to be a mistake, this snapshot is what undoes it.
  // Runs even though restore itself is atomic (single transaction) —
  // that protects against a *failed* restore corrupting things, this
  // protects against a *successful* restore being the wrong call.
  let preRestoreSnapshotId: string;
  try {
    const snapshot = await createBackup(session.userId, true);
    preRestoreSnapshotId = snapshot.id;
  } catch (err) {
    return NextResponse.json(
      { error: `Could not take the required pre-restore safety snapshot, so the restore was not attempted: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  try {
    await runPsqlRestore(restoreContent);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Restore failed and was rolled back — the database is unchanged from before this request. ${err instanceof Error ? err.message : String(err)}`,
        preRestoreSnapshotId,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, preRestoreSnapshotId });
}
