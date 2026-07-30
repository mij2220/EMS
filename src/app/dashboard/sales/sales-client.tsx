"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentType: string;
  source: string;
  trackingNumber: string | null;
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

const STATUS_TAG: Record<string, string> = {
  pending: "mockup-tag-neutral",
  packed: "mockup-tag-neutral",
  dispatched: "mockup-tag-warn",
  in_transit: "mockup-tag-warn",
  delivered: "mockup-tag-good",
  returned: "mockup-tag-bad",
};

export default function SalesClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    fetch("/api/sales/orders")
      .then((r) => r.json())
      .then((d) => {
        setOrders(d.orders ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

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
        </div>
        <button className="mockup-btn mockup-btn-primary" disabled title="PDF parsing is a Day-4+ build — see EMS_Development_Plan.md">
          + Import Courier PDF
        </button>
      </div>

      <div className="mockup-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer / City</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Profit</th>
                <th className="px-4 py-3">Courier</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/dashboard/sales/${o.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                    style={{ borderTop: "1px solid var(--line)" }}
                  >
                    <td className="px-4 py-3 font-mono text-xs">#{o.orderNumber}</td>
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
                    <td className="px-4 py-3">{o.courierName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={"mockup-tag " + (STATUS_TAG[o.status] ?? "mockup-tag-neutral")}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No orders match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
