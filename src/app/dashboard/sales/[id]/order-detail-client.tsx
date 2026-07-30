"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";

type OrderData = {
  id: string;
  orderNumber: string;
  status: string;
  paymentType: string;
  source: string;
  trackingNumber: string | null;
  remarks: string | null;
  placedAt: string;
  deliveredAt: string | null;
  returnedAt: string | null;
  inventoryDeducted: boolean;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  courierName: string | null;
};

type Item = {
  id: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  productTitle: string;
  option1Value: string;
  option2Value: string;
};

function fmtRs(n: number) {
  return "Rs " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const PIPELINE = ["pending", "packed", "dispatched", "in_transit", "delivered"];
const STAGE_LABELS: Record<string, string> = {
  pending: "Placed",
  packed: "Packed",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  delivered: "Delivered",
};

export default function OrderDetailClient({
  orderId,
  tenantName,
  userInitial,
}: {
  orderId: string;
  tenantName: string;
  userInitial: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sales/orders/${orderId}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data.order);
      setItems(data.items);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function markDelivered() {
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/sales/orders/${orderId}/deliver`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setActionError(data.error);
    load();
  }

  async function markReturned() {
    setBusy(true);
    setActionError(null);
    const res = await fetch(`/api/sales/orders/${orderId}/return`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setActionError(data.error);
    load();
  }

  if (loading) {
    return (
      <AppShell active="sales" title="Order" desc="Loading…" tenantName={tenantName} userInitial={userInitial}>
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </AppShell>
    );
  }
  if (!order) {
    return (
      <AppShell active="sales" title="Order not found" desc="" tenantName={tenantName} userInitial={userInitial}>
        <p style={{ color: "var(--muted)" }}>This order doesn&apos;t exist or you don&apos;t have access to it.</p>
      </AppShell>
    );
  }

  const orderTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const orderProfit = order.status === "returned" ? 0 : items.reduce((s, it) => s + it.qty * (it.unitPrice - it.unitCost), 0);
  const currentIdx = PIPELINE.indexOf(order.status);

  return (
    <AppShell
      active="sales"
      title={`Order #${order.orderNumber}`}
      desc="Items, courier tracking and linked accounting entries"
      tenantName={tenantName}
      userInitial={userInitial}
    >
      <button onClick={() => router.push("/dashboard/sales")} className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        ← Back to Sales & Delivery
      </button>

      <div className="mockup-card mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold">Order #{order.orderNumber}</h1>
          <div className="text-sm mt-1 flex gap-4 flex-wrap" style={{ color: "var(--muted)" }}>
            <span>Placed: {new Date(order.placedAt).toLocaleString()}</span>
            <span>Source: {order.source}</span>
            <span className="mockup-tag mockup-tag-neutral">{order.paymentType.toUpperCase()}</span>
            <span className={"mockup-tag " + (order.status === "delivered" ? "mockup-tag-good" : order.status === "returned" ? "mockup-tag-bad" : "mockup-tag-warn")}>
              {order.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={markDelivered} disabled={busy || order.status === "delivered" || order.status === "returned"} className="mockup-btn mockup-btn-ghost disabled:opacity-40">
            Mark Delivered
          </button>
          <button onClick={markReturned} disabled={busy || order.status === "returned"} className="mockup-btn mockup-btn-primary disabled:opacity-40">
            Mark Returned
          </button>
        </div>
      </div>

      {actionError && (
        <div className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
          {actionError}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="mockup-card">
            <h3 className="font-bold mb-3">Items</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  <th className="pb-2">Product</th>
                  <th className="pb-2">Qty</th>
                  <th className="pb-2">Unit Price</th>
                  <th className="pb-2">Unit Cost</th>
                  <th className="pb-2">Profit</th>
                  <th className="pb-2">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-2">
                      {it.productTitle} ({it.option1Value} / {it.option2Value})
                    </td>
                    <td className="py-2">{it.qty}</td>
                    <td className="py-2">{fmtRs(it.unitPrice)}</td>
                    <td className="py-2">{fmtRs(it.unitCost)}</td>
                    <td className="py-2" style={{ color: "var(--good)" }}>
                      {fmtRs(it.qty * (it.unitPrice - it.unitCost))}
                    </td>
                    <td className="py-2">{fmtRs(it.qty * it.unitPrice)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--line)", fontWeight: 700, background: "var(--paper)" }}>
                  <td colSpan={4} className="py-2 px-2 text-right">
                    Order Profit
                  </td>
                  <td className="py-2" style={{ color: order.status === "returned" ? "var(--muted)" : "var(--good)" }}>
                    {fmtRs(orderProfit)}
                  </td>
                  <td className="py-2">{fmtRs(orderTotal)}</td>
                </tr>
              </tbody>
            </table>
            {order.status === "returned" && (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                This order was returned — items are restocked and no profit is recognized, even though line-item profit
                is shown above for reference.
              </p>
            )}
          </div>

          <div className="mockup-card">
            <h3 className="font-bold mb-1">Delivery Tracking {order.courierName && `— ${order.courierName}`}</h3>
            {order.trackingNumber && (
              <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
                Tracking # {order.trackingNumber}
              </p>
            )}
            {order.status === "returned" ? (
              <div className="text-sm" style={{ color: "var(--bad)" }}>
                ● Returned{" "}
                {order.returnedAt && (
                  <span style={{ color: "var(--muted)" }}>on {new Date(order.returnedAt).toLocaleDateString()}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {PIPELINE.map((stage, i) => (
                  <div key={stage} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mb-1"
                        style={{ background: i <= currentIdx ? "var(--navy)" : "var(--line)", color: i <= currentIdx ? "#fff" : "var(--muted)" }}
                      >
                        {i < currentIdx ? "✓" : i + 1}
                      </div>
                      <div className="text-xs text-center" style={{ color: i <= currentIdx ? "var(--ink)" : "var(--muted)" }}>
                        {STAGE_LABELS[stage]}
                      </div>
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <div className="h-0.5 flex-1 -mt-5" style={{ background: i < currentIdx ? "var(--navy)" : "var(--line)" }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="mockup-card">
            <h3 className="font-bold mb-3">Customer</h3>
            <div className="text-sm space-y-2">
              <div>
                <span style={{ color: "var(--muted)" }}>Name: </span>
                {order.customerName}
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Phone: </span>
                {order.customerPhone}
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Address: </span>
                {order.customerAddress}, {order.customerCity}
              </div>
              {order.remarks && (
                <div>
                  <span style={{ color: "var(--muted)" }}>Remarks: </span>
                  {order.remarks}
                </div>
              )}
            </div>
          </div>

          <div className="mockup-card">
            <h3 className="font-bold mb-2">Inventory Impact</h3>
            <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--paper)" }}>
              {order.status === "delivered" ? (
                <>
                  <span className="mockup-tag mockup-tag-good mr-2">Deducted</span>
                  Stock was reduced when this order reached Delivered.
                </>
              ) : order.status === "returned" ? (
                <>
                  <span className="mockup-tag mockup-tag-warn mr-2">{order.inventoryDeducted ? "Restocked" : "Never deducted"}</span>
                  {order.inventoryDeducted
                    ? "This had already been delivered; the return added units back to stock."
                    : "Returned before delivery — stock was never reduced."}
                </>
              ) : (
                <>
                  <span className="mockup-tag mockup-tag-neutral mr-2">Reserved</span>
                  On-hand won&apos;t decrease until this reaches Delivered.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
