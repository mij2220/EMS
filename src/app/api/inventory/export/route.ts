import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const rows = await db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .leftJoin("locations", "locations.id", "variants.locationId")
    .select([
      "products.handle",
      "products.title",
      "products.option1Name",
      "variants.option1Value",
      "products.option2Name",
      "variants.option2Value",
      "variants.sku",
      "variants.hsCode",
      "locations.name as locationName",
      "variants.binName",
      "variants.costPrice",
      "variants.salePrice",
      "variants.onHand",
      "variants.reorderLevel",
    ])
    .where("products.tenantId", "=", session.tenantId)
    .orderBy(["products.title", "variants.option1Value"])
    .execute();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");

  sheet.columns = [
    { header: "Handle", key: "handle", width: 28 },
    { header: "Title", key: "title", width: 32 },
    { header: "Option1 Name", key: "option1Name", width: 14 },
    { header: "Option1 Value", key: "option1Value", width: 16 },
    { header: "Option2 Name", key: "option2Name", width: 14 },
    { header: "Option2 Value", key: "option2Value", width: 16 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "HS Code", key: "hsCode", width: 12 },
    { header: "Location", key: "locationName", width: 16 },
    { header: "Bin Name", key: "binName", width: 12 },
    { header: "Cost Price", key: "costPrice", width: 12 },
    { header: "Sale Price", key: "salePrice", width: 12 },
    { header: "On Hand", key: "onHand", width: 10 },
    { header: "Reorder Level", key: "reorderLevel", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    sheet.addRow({
      ...r,
      costPrice: r.costPrice != null ? Number(r.costPrice) : null,
      salePrice: r.salePrice != null ? Number(r.salePrice) : null,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `inventory-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
