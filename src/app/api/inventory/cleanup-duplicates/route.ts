import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";

/**
 * Cleans up duplicate variant rows created by the pre-fix case-sensitivity
 * bug (e.g. "black / 4" and "Black / 4" as two separate rows for the same
 * real Shopify variant). For each duplicate group on a product:
 *   - the "winner" is the row with the most on_hand (ties broken by having
 *     a real cost price) — matches the observed pattern where the ghost row
 *     is always the one stuck at 0 stock / missing cost
 *   - losers are deleted, but ONLY if they have no order/stock-adjustment
 *     history — neither orderItems.variantId nor stockAdjustments.variantId
 *     cascade-delete (see db/schema.sql), so Postgres itself refuses the
 *     delete if real history exists. Those get reported instead of touched.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const products = await db.selectFrom("products").select(["id", "title"]).where("tenantId", "=", session.tenantId).execute();

  let deleted = 0;
  const needsManualReview: string[] = [];

  for (const product of products) {
    const variants = await db.selectFrom("variants").selectAll().where("productId", "=", product.id).execute();

    const groups = new Map<string, typeof variants>();
    for (const v of variants) {
      const key = [v.option1Value, v.option2Value, v.option3Value].map((s) => (s ?? "").trim().toLowerCase()).join("␟");
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;

      const sorted = [...group].sort((a, b) => {
        if (b.onHand !== a.onHand) return b.onHand - a.onHand;
        return (b.costPrice ? 1 : 0) - (a.costPrice ? 1 : 0);
      });
      const [winner, ...losers] = sorted;

      for (const loser of losers) {
        try {
          await db.deleteFrom("variants").where("id", "=", loser.id).execute();
          deleted++;
        } catch {
          // Real order/stock-adjustment history exists on this row —
          // Postgres blocked the delete. Report it rather than force it.
          needsManualReview.push(
            `${product.title} — "${loser.option1Value ?? ""} / ${loser.option2Value ?? ""}" (kept "${winner.option1Value ?? ""} / ${winner.option2Value ?? ""}") has order or stock-adjustment history and couldn't be auto-deleted.`
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true, deleted, needsManualReview });
}
