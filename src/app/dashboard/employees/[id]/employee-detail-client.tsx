"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type History = { id: string; voucherNumber: string; voucherDate: string; amount: number; reference: string | null };
type Employee = { id: string; name: string; role: string | null; baseSalary: number | null; advanceBalance: number };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function EmployeeDetailClient({ employeeId, tenantName, userInitial }: { employeeId: string; tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(history, "voucherDate");

  useEffect(() => {
    fetch(`/api/employees/${employeeId}`)
      .then((r) => r.json())
      .then((d) => {
        setEmployee(d.employee);
        setHistory(d.history ?? []);
      });
  }, [employeeId]);

  return (
    <AppShell active="employees" title={employee?.name ?? "Employee"} desc="Salary payment history" tenantName={tenantName} userInitial={userInitial}>
      <button onClick={() => router.push("/dashboard/employees")} className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        ← Back to Employees
      </button>
      <div className="mockup-card mb-6">
        <div className="text-sm" style={{ color: "var(--muted)" }}>Role: {employee?.role ?? "—"}</div>
        {employee?.baseSalary != null && <div className="text-sm" style={{ color: "var(--muted)" }}>Base Salary: {fmtRs(employee.baseSalary)}</div>}
      </div>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("voucherDate")}>
                Date<SortArrow active={sortKey === "voucherDate"} dir={sortDir} />
              </th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                Amount<SortArrow active={sortKey === "amount"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3">{new Date(h.voucherDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">{h.reference}</td>
                <td className="px-4 py-3" style={{ color: "var(--bad)" }}>{fmtRs(h.amount)}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No salary payments logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
