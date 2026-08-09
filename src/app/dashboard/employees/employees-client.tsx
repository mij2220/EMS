"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type Employee = {
  id: string;
  name: string;
  role: string | null;
  status: string;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  advanceBalance: number;
  baseSalary: number | null;
};

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function EmployeesClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(employees, "name");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/employees");
    const data = await res.json();
    setEmployees(data.employees ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), role: f.get("role"), baseSalary: f.get("baseSalary") }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error);
    setShowAdd(false);
    load();
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/employees/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), role: f.get("role"), baseSalary: f.get("baseSalary") }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error);
    setEditing(null);
    load();
  }

  async function toggleStatus(emp: Employee, e: React.MouseEvent) {
    e.stopPropagation();
    setActionError(null);
    const newStatus = emp.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    load();
  }

  async function handleDelete(emp: Employee, e: React.MouseEvent) {
    e.stopPropagation();
    setActionError(null);
    if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    load();
  }

  return (
    <AppShell active="employees" title="Employees" desc="Employee master, salary history and payroll" tenantName={tenantName} userInitial={userInitial}>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowAdd(true)} className="mockup-btn mockup-btn-primary">
          + Add Employee
        </button>
      </div>

      {actionError && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
          {actionError}
        </div>
      )}

      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                Name<SortArrow active={sortKey === "name"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("role")}>
                Role<SortArrow active={sortKey === "role"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("lastPaymentDate")}>
                Last Payment<SortArrow active={sortKey === "lastPaymentDate"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("advanceBalance")}>
                Advance Balance<SortArrow active={sortKey === "advanceBalance"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("status")}>
                Status<SortArrow active={sortKey === "status"} dir={sortDir} />
              </th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr
                key={e.id}
                onClick={() => router.push(`/dashboard/employees/${e.id}`)}
                className="cursor-pointer hover:bg-slate-50"
                style={{ borderTop: "1px solid var(--line)", opacity: e.status === "inactive" ? 0.6 : 1 }}
              >
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{e.role ?? "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                  {e.lastPaymentDate ? `${new Date(e.lastPaymentDate).toLocaleDateString()} — ${fmtRs(e.lastPaymentAmount ?? 0)}` : "No payments logged"}
                </td>
                <td className="px-4 py-3">{fmtRs(e.advanceBalance)}</td>
                <td className="px-4 py-3">
                  <span className={"mockup-tag " + (e.status === "active" ? "mockup-tag-good" : "mockup-tag-neutral")}>{e.status}</span>
                </td>
                <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(e)} className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
                      Edit
                    </button>
                    <button onClick={(ev) => toggleStatus(e, ev)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                      {e.status === "active" ? "Disable" : "Enable"}
                    </button>
                    <button onClick={(ev) => handleDelete(e, ev)} className="text-xs font-semibold" style={{ color: "var(--bad)" }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Add Employee</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Name</label>
                <input name="name" required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Role</label>
                <input name="role" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Base Salary (Rs)</label>
                <input name="baseSalary" type="number" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="mockup-btn mockup-btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Add Employee"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Edit {editing.name}</h2>
            <form onSubmit={handleEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Name</label>
                <input name="name" defaultValue={editing.name} required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Role</label>
                <input name="role" defaultValue={editing.role ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Base Salary (Rs)</label>
                <input name="baseSalary" type="number" defaultValue={editing.baseSalary ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="mockup-btn mockup-btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
