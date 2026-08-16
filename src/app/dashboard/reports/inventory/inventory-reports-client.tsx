"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app-shell";

type StockValuation = { totalCostValue: number; totalRetailValue: number; topProducts: { title: string; onHand: number; costValue: number; retailValue: number }[] };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function InventoryReportsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [valuation, setValuation] = useState<StockValuation | null>(null);

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then((d) => setValuation(d.stockValuation));
  }, []);

  return (
    <AppShell active="inventory-reports" title="Inventory Reports" desc="Stock valuation — computed live" tenantName={tenantName} userInitial={userInitial}>
      {valuation && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="mockup-card">
              <div className="mockup-kpi-label">Total Cost Value</div>
              <div className="mockup-kpi-value">{fmtRs(valuation.totalCostValue)}</div>
            </div>
            <div className="mockup-card">
              <div className="mockup-kpi-label">Total Retail Value</div>
              <div className="mockup-kpi-value">{fmtRs(valuation.totalRetailValue)}</div>
            </div>
            <div className="mockup-card">
              <div className="mockup-kpi-label">Potential Profit</div>
              <div className="mockup-kpi-value">{fmtRs(valuation.totalRetailValue - valuation.totalCostValue)}</div>
            </div>
          </div>
          <div className="mockup-card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
                <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">On Hand</th>
                  <th className="px-4 py-3">Cost Value</th>
                  <th className="px-4 py-3">Retail Value</th>
                </tr>
              </thead>
              <tbody>
                {valuation.topProducts.map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-4 py-3 font-medium">{p.title}</td>
                    <td className="px-4 py-3">{p.onHand}</td>
                    <td className="px-4 py-3">{fmtRs(p.costValue)}</td>
                    <td className="px-4 py-3">{fmtRs(p.retailValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
