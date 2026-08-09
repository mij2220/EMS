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
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(ledger, "voucherDate");

  useEffect(() => {
    fetch(`/api/vendors/${vendorId}`)
      .then((r) => r.json())
      .then((d) => {
        setVendor(d.vendor);
        setLedger(d.ledger ?? []);
      });
  }, [vendorId]);

  const balance = ledger.reduce((s, l) => s + (l.direction === "purchase" ? l.amount : -l.amount), 0);

  return (
    <AppShell active="vendors" title={vendor?.name ?? "Vendor"} desc="Purchase and payment ledger" tenantName={tenantName} userInitial={userInitial}>
      <button onClick={() => router.push("/dashboard/vendors")} className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        ← Back to Vendors
      </button>
      <div className="mockup-card mb-6">
        <div className="text-sm" style={{ color: "var(--muted)" }}>Contact: {vendor?.contact ?? "—"}</div>
        <div className="mockup-kpi-label mt-3">Current Payable Balance</div>
        <div className="mockup-kpi-value">{fmtRs(balance)}</div>
      </div>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("voucherDate")}>
                Date<SortArrow active={sortKey === "voucherDate"} dir={sortDir} />
              </th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Reference</th>
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
    </AppShell>
  );
}
