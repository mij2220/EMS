"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type Ledger = { id: string; entryType: string; amount: number; balanceAfter: number; createdAt: string; orderNumber: string | null };
type Batch = { id: string; batchNumber: string; amount: number; status: string; createdAt: string };
type Variance = { id: string; orderNumber: string; status: string; customerName: string; city: string; slipAmount: number; remittedAmount: number | null };
type Courier = { id: string; name: string; remittanceCycleDays: number; commissionPercent: number; commissionFlat: number };

function fmtRs(n: number) {
  return "Rs " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function CourierDetailClient({ courierId, tenantName, userInitial }: { courierId: string; tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [courier, setCourier] = useState<Courier | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [variance, setVariance] = useState<Variance[]>([]);
  const batchSort = useSortableTable(batches, "createdAt");
  const varianceSort = useSortableTable(variance, "orderNumber");
  const [tab, setTab] = useState<"ledger" | "batches" | "variance">("ledger");
  const [showRemit, setShowRemit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/couriers/${courierId}`);
    const data = await res.json();
    setCourier(data.courier);
    setLedger(data.ledger ?? []);
    setBatches(data.remittanceBatches ?? []);
    setVariance(data.variance ?? []);
  }, [courierId]);

  useEffect(() => {
    load();
  }, [load]);

  const outstanding = ledger[0]?.balanceAfter ?? 0;

  async function handleRemit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/couriers/${courierId}/remittance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchNumber: f.get("batchNumber"), amount: f.get("amount") }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error);
    setShowRemit(false);
    load();
  }

  return (
    <AppShell active="courier" title={courier?.name ?? "Courier"} desc="Ledger, remittance batches and COD variance" tenantName={tenantName} userInitial={userInitial}>
      <button onClick={() => router.push("/dashboard/courier")} className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        ← Back to Courier
      </button>

      <div className="mockup-card mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="mockup-kpi-label">Outstanding Balance</div>
          <div className="mockup-kpi-value">{fmtRs(outstanding)}</div>
          {courier && (
            <div className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              Remittance cycle: {courier.remittanceCycleDays} days · Commission: {courier.commissionPercent}% + {fmtRs(courier.commissionFlat)}
            </div>
          )}
        </div>
        <button onClick={() => setShowRemit(true)} className="mockup-btn mockup-btn-primary">
          Record Remittance
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--line)" }}>
        {(["ledger", "batches", "variance"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-bold capitalize"
            style={{ color: tab === t ? "var(--navy)" : "var(--muted)", borderBottom: tab === t ? "2px solid var(--clay)" : "2px solid transparent" }}
          >
            {t === "ledger" ? "Ledger" : t === "batches" ? "Remittance Batches" : "COD Variance"}
          </button>
        ))}
      </div>

      {tab === "ledger" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3">{new Date(l.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">{l.orderNumber ? `#${l.orderNumber}` : "—"}</td>
                  <td className="px-4 py-3">{l.entryType.replace("_", " ")}</td>
                  <td className="px-4 py-3" style={{ color: l.entryType === "dispatch_credit" ? "var(--good)" : "var(--bad)" }}>
                    {l.entryType === "dispatch_credit" ? "+" : "−"} {fmtRs(l.amount)}
                  </td>
                  <td className="px-4 py-3 font-medium">{fmtRs(l.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "batches" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => batchSort.toggleSort("createdAt")}>
                  Date<SortArrow active={batchSort.sortKey === "createdAt"} dir={batchSort.sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => batchSort.toggleSort("amount")}>
                  Amount<SortArrow active={batchSort.sortKey === "amount"} dir={batchSort.sortDir} />
                </th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {batchSort.sorted.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-mono text-xs">#{b.batchNumber}</td>
                  <td className="px-4 py-3">{new Date(b.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{fmtRs(b.amount)}</td>
                  <td className="px-4 py-3">
                    <span className="mockup-tag mockup-tag-good">{b.status}</span>
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No remittance batches yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "variance" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => varianceSort.toggleSort("orderNumber")}>
                  Order<SortArrow active={varianceSort.sortKey === "orderNumber"} dir={varianceSort.sortDir} />
                </th>
                <th className="px-4 py-3">Consignee / City</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => varianceSort.toggleSort("slipAmount")}>
                  Slip Amount<SortArrow active={varianceSort.sortKey === "slipAmount"} dir={varianceSort.sortDir} />
                </th>
                <th className="px-4 py-3">Remitted</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {varianceSort.sorted.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-mono text-xs">#{v.orderNumber}</td>
                  <td className="px-4 py-3">
                    {v.customerName} — {v.city}
                  </td>
                  <td className="px-4 py-3">{fmtRs(v.slipAmount)}</td>
                  <td className="px-4 py-3">{v.remittedAmount != null ? fmtRs(v.remittedAmount) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={"mockup-tag " + (v.status === "delivered" ? "mockup-tag-good" : v.status === "returned" ? "mockup-tag-bad" : "mockup-tag-warn")}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRemit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowRemit(false)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Record Remittance</h2>
            <form onSubmit={handleRemit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Batch Number</label>
                <input name="batchNumber" required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Amount (Rs)</label>
                <input name="amount" type="number" step="0.01" required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRemit(false)} className="mockup-btn mockup-btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
