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

  const required = ["Handle", "Title", "Option1 Value", "Option2 Value"];
  for (const col of required) {
    if (colIndex(col) === -1) {
      return NextResponse.json({ error: `Missing required column "${col}" — this doesn't look like an EMS export.` }, { status: 400 });
    }
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

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    if (row.cellCount === 0) continue;
    const get = (col: string) => {
      const idx = colIndex(col);
      if (idx === -1) return null;
      const val = row.getCell(idx).value;
      return val == null ? null : String(val).trim();
    };

    const handle = get("Handle");
    const title = get("Title");
    const option1Value = get("Option1 Value");
    const option2Value = get("Option2 Value");
    if (!handle || !title) continue; // skip blank rows

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
            option1Name: get("Option1 Name") || "Color",
            option2Name: get("Option2 Name") || "Size",
            channel: "manual",
            status: "active",
          })
          .returning(["id"])
          .executeTakeFirstOrThrow();
        created++;
      }

      const costPrice = get("Cost Price");
      const salePrice = get("Sale Price");
      const onHand = get("On Hand");
      const reorderLevel = get("Reorder Level");

      const existingVariant = await db
        .selectFrom("variants")
        .select("id")
        .where("productId", "=", product.id)
        .where("option1Value", "=", option1Value ?? "")
        .where("option2Value", "=", option2Value ?? "")
        .executeTakeFirst();

      const variantValues = {
        sku: get("SKU") || null,
        hsCode: get("HS Code") || null,
        binName: get("Bin Name") || null,
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
