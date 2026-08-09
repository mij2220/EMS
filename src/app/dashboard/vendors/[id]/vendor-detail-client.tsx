"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type Ledger = { id: string; voucherNumber: string; voucherDate: string; amount: number; reference: string | null; direction: "purchase" | "payment" };
type Vendor = { id: string; name: string; contact: string | null };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function VendorDetailClient({ vendorId, tenantName, userInitial }: { vendorId: string; tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(ledger, "voucherDate");

  const load = () => {
    fetch(`/api/vendors/${vendorId}`)
      .then((r) => r.json())
      .then((d) => {
        setVendor(d.vendor);
        setLedger(d.ledger ?? []);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const balance = ledger.reduce((s, l) => s + (l.direction === "purchase" ? l.amount : -l.amount), 0);

  return (
    <AppShell active="vendors" title={vendor?.name ?? "Vendor"} desc="Purchase and payment ledger" tenantName={tenantName} userInitial={userInitial}>
      <button onClick={() => router.push("/dashboard/vendors")} className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        ← Back to Vendors
      </button>
      <div className="mockup-card mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>Contact: {vendor?.contact ?? "—"}</div>
          <div className="mockup-kpi-label mt-3">Current Payable Balance</div>
          <div className="mockup-kpi-value">{fmtRs(balance)}</div>
        </div>
        <button onClick={() => setShowPayment(true)} className="mockup-btn mockup-btn-primary">
          Record Payment
        </button>
      </div>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("voucherDate")}>
                Date<SortArrow active={sortKey === "voucherDate"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("direction")}>
                Type<SortArrow active={sortKey === "direction"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("reference")}>
                Reference<SortArrow active={sortKey === "reference"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                Amount<SortArrow active={sortKey === "amount"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3">{new Date(l.voucherDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">{l.direction === "purchase" ? "Purchase (bill)" : "Payment"}</td>
                <td className="px-4 py-3">{l.reference}</td>
                <td className="px-4 py-3" style={{ color: l.direction === "purchase" ? "var(--bad)" : "var(--good)" }}>
                  {fmtRs(l.amount)}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPayment && vendor && (
        <RecordPaymentModal
          vendorId={vendor.id}
          vendorName={vendor.name}
          onClose={() => setShowPayment(false)}
          onSaved={load}
        />
      )}
    </AppShell>
  );
}

function RecordPaymentModal({
  vendorId,
  vendorName,
  onClose,
  onSaved,
}: {
  vendorId: string;
  vendorName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: f.get("amount"), paidFrom: f.get("paidFrom") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Record Payment</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Pay down {vendorName}&apos;s outstanding balance.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Amount (Rs)</label>
            <input name="amount" type="number" step="0.01" required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Paid From</label>
            <select name="paidFrom" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              <option>Cash</option>
              <option>Bank</option>
            </select>
          </div>
          {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="mockup-btn mockup-btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Record Payment"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
