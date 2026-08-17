"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type StockValuation = { totalCostValue: number; totalRetailValue: number; topProducts: { title: string; onHand: number; costValue: number; retailValue: number }[] };
type LowStockRow = { title: string; variant: string; onHand: number; reorderLevel: number; status: string };
type DeadStockRow = { title: string; variant: string; onHand: number; daysSinceLastSale: number | null; valueTiedUp: number };
type AdjustmentRow = { id: string; createdAt: string; title: string; variant: string; qtyDelta: number; reasonCode: string; note: string | null; userName: string };
type MissingInfoRow = { title: string; missing: string[] };
type SellerRow = { title: string; variant: string; unitsSold: number; revenue: number };

const REASON_LABELS: Record<string, string> = {
  damaged: "Damaged in warehouse",
  sample: "Sample given to customer",
  recount: "Stock recount / correction",
  returned_to_stock: "Returned to stock",
  received_po: "Received from purchase order",
  other: "Other",
};

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

// Plain client-side tab state, no URL involvement — see accounts-reports-client.tsx
// for why (an unresolved bug with URL-driven tab selection on a shared page,
// where separate real routes + in-page state turned out to be the fix).
const TABS = [
  { key: "valuation", label: "Stock Valuation" },
  { key: "lowstock", label: "Low Stock Alert" },
  { key: "deadstock", label: "Dead Stock" },
  { key: "adjustments", label: "Adjustment History" },
  { key: "missing", label: "Missing Info" },
  { key: "sellers", label: "Best & Worst Sellers" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function InventoryReportsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [tab, setTab] = useState<TabKey>("valuation");

  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [missingInfo, setMissingInfo] = useState<MissingInfoRow[]>([]);
  const [sellers, setSellers] = useState<SellerRow[]>([]);

  const lowStockSort = useSortableTable(lowStock);
  const deadStockSort = useSortableTable(deadStock);
  const sellersSort = useSortableTable(sellers);

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then((d) => {
        setValuation(d.stockValuation);
        setLowStock(d.lowStock ?? []);
        setDeadStock(d.deadStock ?? []);
        setAdjustments(d.stockAdjustments ?? []);
        setMissingInfo(d.missingInfo ?? []);
        setSellers(d.bestWorstSellers ?? []);
      });
  }, []);

  return (
    <AppShell active="inventory-reports" title="Inventory Reports" desc="Stock valuation, low stock, dead stock, adjustments, data health, and sell-through — computed live" tenantName={tenantName} userInitial={userInitial}>
      <div className="flex gap-1 mb-4 border-b overflow-x-auto" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-bold whitespace-nowrap"
            style={{ color: tab === t.key ? "var(--navy)" : "var(--muted)", borderBottom: tab === t.key ? "2px solid var(--clay)" : "2px solid transparent" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "valuation" && valuation && (
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

      {tab === "lowstock" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => lowStockSort.toggleSort("onHand")}>
                  On Hand<SortArrow active={lowStockSort.sortKey === "onHand"} dir={lowStockSort.sortDir} />
                </th>
                <th className="px-4 py-3">Reorder Level</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {lowStockSort.sorted.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3">{r.variant}</td>
                  <td className="px-4 py-3">{r.onHand}</td>
                  <td className="px-4 py-3">{r.reorderLevel}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: r.status === "Out of stock" ? "var(--bad)" : "var(--warn)" }}>
                    {r.status}
                  </td>
                </tr>
              ))}
              {lowStock.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Nothing below its reorder level right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "deadstock" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3">On Hand</th>
                <th className="px-4 py-3">Days Since Last Sale</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => deadStockSort.toggleSort("valueTiedUp")}>
                  Value Tied Up<SortArrow active={deadStockSort.sortKey === "valueTiedUp"} dir={deadStockSort.sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {deadStockSort.sorted.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3">{r.variant}</td>
                  <td className="px-4 py-3">{r.onHand}</td>
                  <td className="px-4 py-3">{r.daysSinceLastSale === null ? "Never sold" : `${r.daysSinceLastSale} days`}</td>
                  <td className="px-4 py-3">{fmtRs(r.valueTiedUp)}</td>
                </tr>
              ))}
              {deadStock.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Nothing looks stuck — everything with stock has sold within the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
            No sale (excluding returns) in the last 30 days, despite carrying real stock value.
          </div>
        </div>
      )}

      {tab === "adjustments" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
                <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">
                      {r.title} <span style={{ color: "var(--muted)" }}>({r.variant})</span>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: r.qtyDelta >= 0 ? "var(--good)" : "var(--bad)" }}>
                      {r.qtyDelta >= 0 ? "+" : ""}
                      {r.qtyDelta}
                    </td>
                    <td className="px-4 py-3">{REASON_LABELS[r.reasonCode] ?? r.reasonCode}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{r.note ?? "—"}</td>
                    <td className="px-4 py-3">{r.userName}</td>
                  </tr>
                ))}
                {adjustments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                      No stock adjustments recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "missing" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Missing</th>
              </tr>
            </thead>
            <tbody>
              {missingInfo.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3" style={{ color: "var(--warn)" }}>{r.missing.join(", ")}</td>
                </tr>
              ))}
              {missingInfo.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Every product has SKU, cost price, and a photo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
            Go to Inventory to fix any of these directly on the product.
          </div>
        </div>
      )}

      {tab === "sellers" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Variant</th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => sellersSort.toggleSort("unitsSold")}>
                  Units Sold<SortArrow active={sellersSort.sortKey === "unitsSold"} dir={sellersSort.sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => sellersSort.toggleSort("revenue")}>
                  Revenue<SortArrow active={sellersSort.sortKey === "revenue"} dir={sellersSort.sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sellersSort.sorted.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3">{r.variant}</td>
                  <td className="px-4 py-3">{r.unitsSold}</td>
                  <td className="px-4 py-3">{fmtRs(r.revenue)}</td>
                </tr>
              ))}
              {sellers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No sales in the last 30 days yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
            Last 30 days, excluding returns — ranked high to low, so slow movers sit at the bottom.
          </div>
        </div>
      )}
    </AppShell>
  );
}
