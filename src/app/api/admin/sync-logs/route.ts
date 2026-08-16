import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The scheduler itself only ever keeps 2 days of rows (see
  // instrumentation.ts retention cleanup), so no extra filtering is needed
  // here — this just returns whatever's still in the table.
  const logs = await db
    .selectFrom("syncLogs")
    .selectAll()
    .where("tenantId", "=", session.tenantId)
    .orderBy("createdAt", "desc")
    .limit(200)
    .execute();

  return NextResponse.json({ logs });
}
