import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const voucher = await db
    .selectFrom("vouchers")
    .select(["photoData", "photoMimeType"])
    .where("id", "=", id)
    .where("tenantId", "=", session.tenantId)
    .executeTakeFirst();

  if (!voucher || !voucher.photoData) {
    return NextResponse.json({ error: "No photo for this voucher." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(voucher.photoData), {
    headers: {
      "Content-Type": voucher.photoMimeType || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
