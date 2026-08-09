"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type Variant = {
  id: string;
  sku: string | null;
  option1Value: string | null;
  option2Value: string | null;
  hsCode: string | null;
  binName: string | null;
  costPrice: number | null;
  salePrice: number | null;
  onHand: number;
  reorderLevel: number;
  locationName: string | null;
};

type Product = {
  id: string;
  title: string;
  handle: string;
  status: string;
  option1Name: string | null;
  option2Name: string | null;
  countryOfOrigin: string | null;
};

type Adjustment = {
  id: string;
  qtyDelta: number;
  reasonCode: string;
  note: string | null;
  createdAt: string;
  option1Value: string;
  option2Value: string;
  userName: string;
};

function fmtRs(n: number | null) {
  if (n == null) return "—";
  return "Rs " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const REASON_LABELS: Record<string, string> = {
  damaged: "Damaged in warehouse",
  sample: "Sample given to customer",
  recount: "Stock recount / correction",
  returned_to_stock: "Returned to stock",
  received_po: "Received from purchase order",
  other: "Other",
};

export default function ProductDetailClient({
  product: initialProduct,
  variants: initialVariants,
  tenantName,
  userInitial,
}: {
  product: Product;
  variants: Variant[];
  tenantName: string;
  userInitial: string;
}) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [variants, setVariants] = useState(initialVariants);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(variants, "onHand");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showAddVariant, setShowAddVariant] = useState(false);
  const [editVariant, setEditVariant] = useState<Variant | null>(null);
  const [adjustVariant, setAdjustVariant] = useState<Variant | null>(null);
  const [showEditProduct, setShowEditProduct] = useState(false);

  const totalOnHand = variants.reduce((s, v) => s + v.onHand, 0);

  const loadAdjustments = useCallback(async () => {
    const res = await fetch(`/api/inventory/stock-adjustments`);
    if (res.ok) {
      const data = await res.json();
      setAdjustments(data.adjustments);
    }
  }, []);

  useEffect(() => {
    loadAdjustments();
  }, [loadAdjustments]);

  async function refreshVariants() {
    const res = await fetch(`/api/inventory/products/${product.id}`);
    if (res.ok) {
      const data = await res.json();
      setVariants(data.variants);
    }
    loadAdjustments();
  }

  async function handleDeleteProduct() {
    if (!confirm(`Delete "${product.title}" and all its variants? This cannot be undone.`)) return;
    const res = await fetch(`/api/inventory/products/${product.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Could not delete product.");
      return;
    }
    router.push("/dashboard/inventory");
  }

  async function handleDeleteVariant(variantId: string) {
    if (!confirm("Delete this variant?")) return;
    const res = await fetch(`/api/inventory/variants/${variantId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Could not delete variant.");
      return;
    }
    refreshVariants();
  }

  return (
    <AppShell
      active="inventory"
      title={product.title}
      desc="Variants, cost/profit, stock adjustments and adjustments log"
      tenantName={tenantName}
      userInitial={userInitial}
    >
      <button onClick={() => router.push("/dashboard/inventory")} className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        ← Back to Inventory
      </button>

      <div className="mockup-card mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold">{product.title}</h1>
          <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Handle: <code>{product.handle}</code> · Status: {product.status}
            {product.countryOfOrigin && <> · Origin: {product.countryOfOrigin}</>}
          </div>
          <div className="flex gap-6 mt-4">
            <div>
              <div className="mockup-kpi-label">Total On Hand</div>
              <div className="text-xl font-bold">{totalOnHand}</div>
            </div>
            <div>
              <div className="mockup-kpi-label">Variants</div>
              <div className="text-xl font-bold">{variants.length}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEditProduct(true)} className="mockup-btn mockup-btn-ghost">
            Edit Product
          </button>
          <button onClick={handleDeleteProduct} className="mockup-btn" style={{ background: "#fff", border: "1px solid var(--bad)", color: "var(--bad)" }}>
            Delete Product
          </button>
        </div>
      </div>

      <div className="mockup-card !p-0 mb-6">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 className="font-bold">Variants</h2>
          <button onClick={() => setShowAddVariant(true)} className="mockup-btn mockup-btn-primary">
            + Add Variant
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead style={{ background: "var(--paper)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-2 cursor-pointer select-none" onClick={() => toggleSort("option1Value")}>
                  Variant<SortArrow active={sortKey === "option1Value"} dir={sortDir} />
                </th>
                <th className="px-4 py-2 cursor-pointer select-none" onClick={() => toggleSort("sku")}>
                  SKU<SortArrow active={sortKey === "sku"} dir={sortDir} />
                </th>
                <th className="px-4 py-2 cursor-pointer select-none" onClick={() => toggleSort("costPrice")}>
                  Cost<SortArrow active={sortKey === "costPrice"} dir={sortDir} />
                </th>
                <th className="px-4 py-2 cursor-pointer select-none" onClick={() => toggleSort("salePrice")}>
                  Price<SortArrow active={sortKey === "salePrice"} dir={sortDir} />
                </th>
                <th className="px-4 py-2 cursor-pointer select-none" onClick={() => toggleSort("onHand")}>
                  On Hand<SortArrow active={sortKey === "onHand"} dir={sortDir} />
                </th>
                <th className="px-4 py-2 cursor-pointer select-none" onClick={() => toggleSort("reorderLevel")}>
                  Reorder<SortArrow active={sortKey === "reorderLevel"} dir={sortDir} />
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-2">
                    {v.option1Value} / {v.option2Value}
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>
                    {v.sku || "— missing —"}
                  </td>
                  <td className="px-4 py-2">{fmtRs(v.costPrice)}</td>
                  <td className="px-4 py-2">{fmtRs(v.salePrice)}</td>
                  <td className="px-4 py-2 font-medium">{v.onHand}</td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>
                    {v.reorderLevel}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button onClick={() => setAdjustVariant(v)} className="text-xs font-semibold mr-3" style={{ color: "var(--navy)" }}>
                      Adjust Stock
                    </button>
                    <button onClick={() => setEditVariant(v)} className="text-xs font-semibold mr-3" style={{ color: "var(--navy)" }}>
                      Edit
                    </button>
                    <button onClick={() => handleDeleteVariant(v.id)} className="text-xs font-semibold" style={{ color: "var(--bad)" }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mockup-card">
        <h2 className="font-bold mb-3">Recent Stock Adjustments</h2>
        {adjustments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No stock adjustments recorded yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="py-1">Date</th>
                <th className="py-1">Variant</th>
                <th className="py-1">Change</th>
                <th className="py-1">Reason</th>
                <th className="py-1">User</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.slice(0, 10).map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-2">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">
                    {a.option1Value} / {a.option2Value}
                  </td>
                  <td className="py-2 font-medium" style={{ color: a.qtyDelta > 0 ? "var(--good)" : "var(--bad)" }}>
                    {a.qtyDelta > 0 ? `+ ${a.qtyDelta}` : a.qtyDelta}
                  </td>
                  <td className="py-2">
                    {REASON_LABELS[a.reasonCode] ?? a.reasonCode}
                    {a.note ? ` — ${a.note}` : ""}
                  </td>
                  <td className="py-2">{a.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddVariant && (
        <VariantModal
          title="Add Variant"
          onClose={() => setShowAddVariant(false)}
          onSave={async (values) => {
            const res = await fetch(`/api/inventory/products/${product.id}/variants`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) return data.error ?? "Something went wrong.";
            setShowAddVariant(false);
            refreshVariants();
            return null;
          }}
        />
      )}

      {editVariant && (
        <VariantModal
          title="Edit Variant"
          initial={editVariant}
          hideOnHand
          onClose={() => setEditVariant(null)}
          onSave={async (values) => {
            const res = await fetch(`/api/inventory/variants/${editVariant.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) return data.error ?? "Something went wrong.";
            setEditVariant(null);
            refreshVariants();
            return null;
          }}
        />
      )}

      {adjustVariant && (
        <AdjustStockModal
          variant={adjustVariant}
          onClose={() => setAdjustVariant(null)}
          onSave={async (values) => {
            const res = await fetch(`/api/inventory/stock-adjustments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ variantId: adjustVariant.id, ...values }),
            });
            const data = await res.json();
            if (!res.ok) return data.error ?? "Something went wrong.";
            setAdjustVariant(null);
            refreshVariants();
            return null;
          }}
        />
      )}

      {showEditProduct && (
        <EditProductModal
          product={product}
          onClose={() => setShowEditProduct(false)}
          onSave={async (values) => {
            const res = await fetch(`/api/inventory/products/${product.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) return data.error ?? "Something went wrong.";
            setProduct({ ...product, ...values });
            setShowEditProduct(false);
            return null;
          }}
        />
      )}
    </AppShell>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function VariantModal({
  title,
  initial,
  hideOnHand,
  onClose,
  onSave,
}: {
  title: string;
  initial?: Variant;
  hideOnHand?: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string | number>) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const values: Record<string, string | number> = {
      option1Value: String(form.get("option1Value") || ""),
      option2Value: String(form.get("option2Value") || ""),
      sku: String(form.get("sku") || ""),
      hsCode: String(form.get("hsCode") || ""),
      costPrice: Number(form.get("costPrice") || 0),
      salePrice: Number(form.get("salePrice") || 0),
      reorderLevel: Number(form.get("reorderLevel") || 30),
    };
    if (!hideOnHand) values.onHand = Number(form.get("onHand") || 0);
    const err = await onSave(values);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
            <input name="option1Value" defaultValue={initial?.option1Value ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Size</label>
            <input name="option2Value" defaultValue={initial?.option2Value ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">SKU</label>
            <input name="sku" defaultValue={initial?.sku ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">HS Code</label>
            <input name="hsCode" defaultValue={initial?.hsCode ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cost (Rs)</label>
            <input name="costPrice" type="number" step="0.01" defaultValue={initial?.costPrice ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Price (Rs)</label>
            <input name="salePrice" type="number" step="0.01" defaultValue={initial?.salePrice ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reorder Level</label>
            <input name="reorderLevel" type="number" defaultValue={initial?.reorderLevel ?? 30} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        {!hideOnHand && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">On Hand (initial stock)</label>
            <input name="onHand" type="number" defaultValue={0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        )}
        {hideOnHand && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            On-hand: <b>{initial?.onHand}</b> — quantity changes go through <b>Adjust Stock</b>, not here, so they stay reason-coded and logged.
          </p>
        )}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg px-4 py-2">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="text-sm font-semibold text-white bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustStockModal({
  variant,
  onClose,
  onSave,
}: {
  variant: Variant;
  onClose: () => void;
  onSave: (values: { qtyDelta: number; reasonCode: string; note: string }) => Promise<string | null>;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const qty = Number(form.get("qty") || 0);
    if (!qty || qty <= 0) {
      setError("Enter a quantity greater than 0.");
      setSaving(false);
      return;
    }
    const err = await onSave({
      qtyDelta: direction === "add" ? qty : -qty,
      reasonCode: String(form.get("reasonCode")),
      note: String(form.get("note") || ""),
    });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <Modal title="Adjust Stock" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {variant.option1Value} / {variant.option2Value} — currently <b>{variant.onHand}</b> on hand.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "add" | "remove")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="add">Add stock (+)</option>
              <option value="remove">Remove stock (−)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
            <input name="qty" type="number" min="1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
          <select name="reasonCode" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {Object.entries(REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Note (optional)</label>
          <input name="note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg px-4 py-2">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="text-sm font-semibold text-white bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : "Save Adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditProductModal({
  product,
  onClose,
  onSave,
}: {
  product: Product;
  onClose: () => void;
  onSave: (values: { title: string; countryOfOrigin: string }) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const err = await onSave({
      title: String(form.get("title") || ""),
      countryOfOrigin: String(form.get("countryOfOrigin") || ""),
    });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <Modal title="Edit Product" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
          <input name="title" defaultValue={product.title} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Country of Origin</label>
          <input name="countryOfOrigin" defaultValue={product.countryOfOrigin ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg px-4 py-2">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="text-sm font-semibold text-white bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
