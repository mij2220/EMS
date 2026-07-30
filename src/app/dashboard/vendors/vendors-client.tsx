"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";

type Vendor = { id: string; name: string; contact: string | null; payableBalance: number; lastActivity: string | null };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function VendorsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  return (
    <AppShell active="vendors" title="Vendors" desc="Vendor master, purchase ledger and payables" tenantName={tenantName} userInitial={userInitial}>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowAdd(true)} className="mockup-btn mockup-btn-primary">
          + Add Vendor
        </button>
      </div>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Payable Balance</th>
              <th className="px-4 py-3">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} onClick={() => router.push(`/dashboard/vendors/${v.id}`)} className="cursor-pointer hover:bg-slate-50" style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-medium">{v.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.contact ?? "—"}</td>
                <td className="px-4 py-3">{fmtRs(v.payableBalance)}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.lastActivity ? new Date(v.lastActivity).toLocaleDateString() : "No purchases yet"}</td>
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
    </AppShell>
  );
}
