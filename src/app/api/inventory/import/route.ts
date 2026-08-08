import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import ExcelJS from "exceljs";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return NextResponse.json({ error: "Could not read this file — is it a real .xlsx export?" }, { status: 400 });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "No worksheet found in this file." }, { status: 400 });

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => String(h ?? "").trim());
  const colIndex = (name: string) => headers.indexOf(name);

  if (colIndex("Handle") === -1) {
    return NextResponse.json({ error: 'Missing a "Handle" column — this doesn\'t look like a product export.' }, { status: 400 });
  }

  // Accepts either EMS's own round-trip export column names, or a real
  // native Shopify product export's column names — whichever is present.
  // This matters: a raw Shopify export uses "Variant Price" / "Cost per
  // item" / "Variant Inventory Qty", not "Sale Price" / "Cost Price" /
  // "On Hand". Silently not finding those columns would previously import
  // every price/cost/stock as blank/zero instead of erroring — a real data
  // corruption risk, not just "won't work".
  function getAny(row: ExcelJS.Row, ...names: string[]): string | null {
    for (const name of names) {
      const idx = colIndex(name);
      if (idx === -1) continue;
      const val = row.getCell(idx).value;
      if (val != null && String(val).trim() !== "") return String(val).trim();
    }
    return null;
  }

  const location = await db
    .selectFrom("locations")
    .select("id")
    .where("tenantId", "=", session.tenantId)
    .where("isDefault", "=", true)
    .executeTakeFirst();

  let updated = 0;
  let created = 0;
  const errors: string[] = [];

  // Shopify's own export only fills Title/Option Names on the FIRST row of
  // each product, leaving them blank on every subsequent variant row of the
  // same product — these values need to carry forward, not be treated as
  // "no data on this row".
  let lastHandle = "";
  let lastTitle = "";
  let lastOpt1Name = "";
  let lastOpt2Name = "";

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    if (row.cellCount === 0) continue;

    const handle = getAny(row, "Handle");
    if (!handle) continue;

    if (handle !== lastHandle) {
      lastHandle = handle;
      lastTitle = "";
      lastOpt1Name = "";
      lastOpt2Name = "";
    }

    const rawTitle = getAny(row, "Title");
    if (rawTitle) lastTitle = rawTitle;
    const title = lastTitle;

    const rawOpt1Name = getAny(row, "Option1 Name");
    if (rawOpt1Name) lastOpt1Name = rawOpt1Name;
    const rawOpt2Name = getAny(row, "Option2 Name");
    if (rawOpt2Name) lastOpt2Name = rawOpt2Name;

    const option1Value = getAny(row, "Option1 Value");
    const option2Value = getAny(row, "Option2 Value");
    const sku = getAny(row, "SKU", "Variant SKU");
    const costPrice = getAny(row, "Cost Price", "Cost per item");
    const salePrice = getAny(row, "Sale Price", "Variant Price");
    const onHand = getAny(row, "On Hand", "Variant Inventory Qty");
    const shopifyStatus = getAny(row, "Status"); // Shopify: active | draft | archived

    // A pure image-attachment row (Shopify sometimes adds extra rows just to
    // carry an additional product photo, with no variant data at all) —
    // skip it rather than creating a bogus blank variant.
    if (!option1Value && !option2Value && !salePrice && !onHand && !sku) continue;
    if (!title) continue; // no title anywhere for this handle yet — can't create a product from this alone

    try {
      let product = await db
        .selectFrom("products")
        .select("id")
        .where("tenantId", "=", session.tenantId)
        .where("handle", "=", handle)
        .executeTakeFirst();

      if (!product) {
        product = await db
          .insertInto("products")
          .values({
            tenantId: session.tenantId,
            handle,
            title,
            option1Name: lastOpt1Name || "Color",
            option2Name: lastOpt2Name || "Size",
            imageUrl: getAny(row, "Image Src"),
            channel: "manual",
            status: shopifyStatus === "draft" || shopifyStatus === "archived" ? shopifyStatus : "active",
          })
          .returning(["id"])
          .executeTakeFirstOrThrow();
        created++;
      }

      const reorderLevel = getAny(row, "Reorder Level");
      const hsCode = getAny(row, "HS Code");
      const binName = getAny(row, "Bin Name");

      const existingVariant = await db
        .selectFrom("variants")
        .select("id")
        .where("productId", "=", product.id)
        .where("option1Value", "=", option1Value ?? "")
        .where("option2Value", "=", option2Value ?? "")
        .executeTakeFirst();

      const variantValues = {
        sku: sku || null,
        hsCode: hsCode || null,
        binName: binName || null,
        costPrice: costPrice ? Number(costPrice).toString() : null,
        salePrice: salePrice ? Number(salePrice).toString() : null,
        onHand: onHand ? Math.round(Number(onHand)) : 0,
        reorderLevel: reorderLevel ? Math.round(Number(reorderLevel)) : 30,
      };

      if (existingVariant) {
        await db.updateTable("variants").set(variantValues).where("id", "=", existingVariant.id).execute();
      } else {
        await db
          .insertInto("variants")
          .values({
            productId: product.id,
            option1Value: option1Value ?? "",
            option2Value: option2Value ?? "",
            locationId: location?.id ?? null,
            ...variantValues,
          })
          .execute();
      }
      updated++;
    } catch (e) {
      errors.push(`Row ${rowNum} (${handle}): ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ ok: true, updated, created, errors: errors.slice(0, 10) });
}
