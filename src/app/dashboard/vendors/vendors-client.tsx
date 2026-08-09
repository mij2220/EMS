"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";

type Vendor = { id: string; name: string; contact: string | null; status: string; payableBalance: number; lastActivity: string | null };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function VendorsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/vendors");
    const data = await res.json();
    setVendors(data.vendors ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), contact: f.get("contact") }),
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
    const res = await fetch(`/api/vendors/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.get("name"), contact: f.get("contact") }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error);
    setEditing(null);
    load();
  }

  async function toggleStatus(v: Vendor, e: React.MouseEvent) {
    e.stopPropagation();
    setActionError(null);
    const newStatus = v.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/vendors/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    load();
  }

  async function handleDelete(v: Vendor, e: React.MouseEvent) {
    e.stopPropagation();
    setActionError(null);
    if (!confirm(`Delete ${v.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/vendors/${v.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setActionError(data.error);
    load();
  }

  return (
    <AppShell active="vendors" title="Vendors" desc="Vendor master, purchase ledger and payables" tenantName={tenantName} userInitial={userInitial}>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowAdd(true)} className="mockup-btn mockup-btn-primary">
          + Add Vendor
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
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Payable Balance</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr
                key={v.id}
                onClick={() => router.push(`/dashboard/vendors/${v.id}`)}
                className="cursor-pointer hover:bg-slate-50"
                style={{ borderTop: "1px solid var(--line)", opacity: v.status === "inactive" ? 0.6 : 1 }}
              >
                <td className="px-4 py-3 font-medium">{v.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.contact ?? "—"}</td>
                <td className="px-4 py-3">{fmtRs(v.payableBalance)}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.lastActivity ? new Date(v.lastActivity).toLocaleDateString() : "No purchases yet"}</td>
                <td className="px-4 py-3">
                  <span className={"mockup-tag " + (v.status === "active" ? "mockup-tag-good" : "mockup-tag-neutral")}>{v.status}</span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(v)} className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
                      Edit
                    </button>
                    <button onClick={(e) => toggleStatus(v, e)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                      {v.status === "active" ? "Disable" : "Enable"}
                    </button>
                    <button onClick={(e) => handleDelete(v, e)} className="text-xs font-semibold" style={{ color: "var(--bad)" }}>
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
            <h2 className="text-lg font-bold mb-4">Add Vendor</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Name</label>
                <input name="name" required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Contact</label>
                <input name="contact" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="mockup-btn mockup-btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Add Vendor"}</button>
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
                <label className="block text-xs font-semibold mb-1">Contact</label>
                <input name="contact" defaultValue={editing.contact ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
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
