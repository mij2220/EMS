import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/require-session";
import { buildXlsxResponse } from "@/lib/xlsx-export";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const employees = await db.selectFrom("employees").selectAll().where("tenantId", "=", session.tenantId).orderBy("name").execute();
  const filtered = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || (e.role ?? "").toLowerCase().includes(q))
    : employees;

  return buildXlsxResponse(
    "Employees",
    [
      { header: "Name", key: "name", width: 24 },
      { header: "Role", key: "role", width: 18 },
      { header: "Status", key: "status", width: 12 },
      { header: "Base Salary", key: "baseSalary", width: 14 },
      { header: "Advance Balance", key: "advanceBalance", width: 16 },
    ],
    filtered.map((e) => ({
      name: e.name,
      role: e.role,
      status: e.status,
      baseSalary: e.baseSalary != null ? Number(e.baseSalary) : null,
      advanceBalance: Number(e.advanceBalance),
    })),
    "employees-export"
  );
}
