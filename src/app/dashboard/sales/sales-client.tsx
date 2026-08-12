"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";
import { usePagination, PaginationControls } from "@/lib/use-pagination";
import AppShell from "@/components/app-shell";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentType: string;
  source: string;
  trackingNumber: string | null;
  placedAt: string;
  customerName: string;
  city: string;
  courierName: string | null;
  amount: number;
  profit: number;
  itemCount: number;
};

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

const STATUS_TAG: Record<string, string> = {
  pending: "mockup-tag-neutral",
  packed: "mockup-tag-neutral",
  dispatched: "mockup-tag-warn",
  in_transit: "mockup-tag-warn",
  delivered: "mockup-tag-good",
  returned: "mockup-tag-bad",
};

const SOURCE_LABEL: Record<string, string> = {
  manual_pdf: "Manual PDF",
  shopify_sync: "Shopify Sync",
  woocommerce: "WooCommerce",
};

export default function SalesClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courierFilter, setCourierFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  function loadOrders() {
    fetch("/api/sales/orders")
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function handleSyncSales() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sales/sync-shopify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult({ ok: false, message: data.error ?? "Sync failed." });
        return;
      }
      const parts = [`${data.ordersCreated} created`, `${data.ordersUpdated} updated`, `${data.ordersSkipped} skipped`];
      let message = `Synced — ${parts.join(", ")}.`;
      if (data.unmatchedItems?.length) {
        message += ` ${data.unmatchedItems.length} line item(s) couldn't be matched to a product/variant.`;
      }
      if (data.errors?.length) {
        message += ` ${data.errors.length} order(s) failed.`;
      }
      setSyncResult({ ok: !data.errors?.length, message });
      loadOrders();
    } catch {
      setSyncResult({ ok: false, message: "Could not reach the server." });
    } finally {
      setSyncing(false);
    }
  }

  const couriers = useMemo(() => [...new Set(orders.map((o) => o.courierName).filter((c): c is string => !!c))].sort(), [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (courierFilter && o.courierName !== courierFilter) return false;
      if (sourceFilter && o.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, courierFilter, sourceFilter]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(filtered, "placedAt");
  const { paged, page, setPage, pageCount, pageSize, total } = usePagination(sorted, 20);

  return (
    <AppShell
      active="sales"
      title="Sales & Delivery"
      desc="Order lifecycle, courier assignment and PDF import"
      tenantName={tenantName}
      userInitial={userInitial}
    >
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search order, customer, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="packed">Packed</option>
            <option value="dispatched">Dispatched</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="returned">Returned</option>
          </select>
          <select
            value={courierFilter}
            onChange={(e) => setCourierFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="">All couriers</option>
            {couriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="">All sources</option>
            <option value="manual_pdf">Manual PDF</option>
            <option value="shopify_sync">Shopify Sync</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowHistory(true)} className="mockup-btn mockup-btn-ghost">
            🕘 Import History
          </button>
          <button
            onClick={handleSyncSales}
            disabled={syncing}
            className="mockup-btn mockup-btn-ghost disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "⟳ Sync Sales"}
          </button>
          <button
            disabled
            title="PDF parsing (reading a real courier consignment slip and matching it to orders) is a larger, riskier build than the rest of this app — deliberately not faked. See EMS_Development_Plan.md."
            className="mockup-btn mockup-btn-primary opacity-50 cursor-not-allowed"
          >
            + Import Courier PDF
          </button>
        </div>
      </div>

      {syncResult && (
        <div
          className="text-sm rounded-lg px-3 py-2 mb-4"
          style={{ background: syncResult.ok ? "var(--good-bg)" : "var(--bad-bg)", color: syncResult.ok ? "var(--good)" : "var(--bad)" }}
        >
          {syncResult.message}
        </div>
      )}

      <div className="mockup-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("orderNumber")}>
                  Order<SortArrow active={sortKey === "orderNumber"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("placedAt")}>
                  Date<SortArrow active={sortKey === "placedAt"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("customerName")}>
                  Customer / City<SortArrow active={sortKey === "customerName"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("itemCount")}>
                  Items<SortArrow active={sortKey === "itemCount"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                  Amount<SortArrow active={sortKey === "amount"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("profit")}>
                  Profit<SortArrow active={sortKey === "profit"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("paymentType")}>
                  Payment<SortArrow active={sortKey === "paymentType"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("courierName")}>
                  Courier / Tracking #<SortArrow active={sortKey === "courierName"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("source")}>
                  Source<SortArrow active={sortKey === "source"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("status")}>
                  Status<SortArrow active={sortKey === "status"} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                paged.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/dashboard/sales/${o.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                    style={{ borderTop: "1px solid var(--line)" }}
                  >
                    <td className="px-4 py-3 font-mono text-xs">#{o.orderNumber}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                      {fmtDate(o.placedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {o.customerName}
                      <br />
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {o.city}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                      {o.itemCount} item(s)
                    </td>
                    <td className="px-4 py-3">{fmtRs(o.amount)}</td>
                    <td className="px-4 py-3" style={{ color: o.profit > 0 ? "var(--good)" : "var(--muted)" }}>
                      {fmtRs(o.profit)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="mockup-tag mockup-tag-neutral">{o.paymentType.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3">
                      {o.courierName ?? "—"}
                      {o.trackingNumber && (
                        <>
                          <br />
                          <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                            {o.trackingNumber}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                      {SOURCE_LABEL[o.source] ?? o.source}
                    </td>
                    <td className="px-4 py-3">
                      <span className={"mockup-tag " + (STATUS_TAG[o.status] ?? "mockup-tag-neutral")}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No orders match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} pageCount={pageCount} setPage={setPage} total={total} pageSize={pageSize} />
      </div>

      <div className="text-sm mt-3" style={{ color: "var(--muted)" }}>
        Profit = (sale price − real derived cost) per item, summed per order. Returned orders show Rs 0
        profit — items are restocked and no sale is recognized. Click any row to open the full order detail
        page.
      </div>

      {showHistory && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Import History</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              Every courier PDF ever imported, and what it did to your orders.
            </p>
            <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
              No PDFs imported yet — all {orders.length} order(s) currently in the system were loaded by the
              seed script, not through this flow. This list will populate once PDF import is built (see the
              "+ Import Courier PDF" button's tooltip).
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowHistory(false)} className="mockup-btn mockup-btn-ghost">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
