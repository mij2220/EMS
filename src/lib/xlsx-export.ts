import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

export type ExportColumn = {
  header: string;
  key: string;
  width?: number;
};

/**
 * Builds an .xlsx file from rows + column defs and returns it as a
 * download-ready NextResponse. Shared by every table's export route so the
 * workbook setup, headers, and Content-Disposition handling stay consistent
 * — see /api/inventory/export for the original pattern this generalizes.
 */
export async function buildXlsxResponse(
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  filenamePrefix: string
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) sheet.addRow(r);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
