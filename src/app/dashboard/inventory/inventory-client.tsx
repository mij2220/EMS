"use client";

import { useState, useMemo, useRef } from "react";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";
import { usePagination, PaginationControls } from "@/lib/use-pagination";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";

type Product = {
  id: string;
  handle: string;
  title: string;
  status: string;
  imageUrl: string | null;
  variantCount: number;
  totalOnHand: number;
  minPrice: number | null;
  maxPrice: number | null;
  minCost: number | null;
  maxCost: number | null;
  hasMissingSku: boolean;
  locationNames: string[];
};

function fmtRs(n: number | null) {
  if (n == null) return "—";
  return "Rs " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function priceRange(min: number | null, max: number | null) {
  if (min == null) return "—";
  if (min === max) return fmtRs(min);
  return `${fmtRs(min)} – ${fmtRs(max)}`;
}

function statusOf(p: Product): { label: string; cls: string } {
  if (p.status === "draft") return { label: "Draft", cls: "mockup-tag-neutral" };
  if (p.totalOnHand === 0) return { label: "Out of Stock", cls: "mockup-tag-bad" };
  if (p.totalOnHand < 50) return { label: "Low Stock", cls: "mockup-tag-bad" };
  return { label: "In Stock", cls: "mockup-tag-good" };
}

export default function InventoryClient({
  initialProducts,
  locations,
  tenantName,
  userInitial,
}: {
  initialProducts: Product[];
  locations: string[];
  tenantName: string;
  userInitial: string;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [duplicateVariants, setDuplicateVariants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalVariants = products.reduce((s, p) => s + p.variantCount, 0);
  const missingSkuCount = products.filter((p) => p.hasMissingSku).length;
  const withPhotoCount = products.filter((p) => p.imageUrl).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (statusFilter && statusOf(p).label !== statusFilter) return false;
        if (locationFilter && !p.locationNames.includes(locationFilter)) return false;
        if (!q) return true;
        return p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q);
      })
      .map((p) => ({
        ...p,
        profitPerUnit: p.minPrice != null && p.minCost != null ? p.minPrice - p.minCost : null,
        statusLabel: statusOf(p).label,
        skuLabel: p.hasMissingSku ? "missing" : "assigned",
      }));
  }, [products, search, statusFilter, locationFilter]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(filtered, "title");
  const { paged, page, setPage, pageCount, pageSize, total } = usePagination(sorted, 20);

  async function handleAddProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          option1Value: form.get("option1Value"),
          option2Value: form.get("option2Value"),
          costPrice: form.get("costPrice") || null,
          salePrice: form.get("salePrice") || null,
          onHand: form.get("onHand") || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setShowAddModal(false);
      router.refresh();
      setProducts((prev) => [
        ...prev,
        {
          id: data.productId,
          handle: "",
          title: String(form.get("title")),
          status: "active",
          imageUrl: null,
          variantCount: 1,
          totalOnHand: Number(form.get("onHand") || 0),
          minPrice: form.get("salePrice") ? Number(form.get("salePrice")) : null,
          maxPrice: form.get("salePrice") ? Number(form.get("salePrice")) : null,
          minCost: form.get("costPrice") ? Number(form.get("costPrice")) : null,
          maxCost: form.get("costPrice") ? Number(form.get("costPrice")) : null,
          hasMissingSku: true,
          locationNames: [],
        },
      ]);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === paged.length ? new Set() : new Set(paged.map((p) => p.id))));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected product(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/inventory/products/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Something went wrong.");
        return;
      }
      let msg = `Deleted ${data.deleted} product(s).`;
      if (data.blocked?.length) {
        msg += ` Could not delete (has order/stock-adjustment history, so it's protected instead of removed): ${data.blocked.join(", ")}.`;
      }
      alert(msg);
      setSelectedIds(new Set());
      router.refresh();
      window.location.reload();
    } catch {
      alert("Could not reach the server.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("Uploading…");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/inventory/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(`Import failed: ${data.error ?? "unknown error"}`);
        return;
      }
      setImportMsg(`Imported ${data.updated} variant(s), created ${data.created} new product(s).`);
      router.refresh();
      window.location.reload();
    } catch {
      setImportMsg("Could not reach the server.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/inventory/sync-shopify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(`Sync failed: ${data.error ?? "unknown error"}`);
        return;
      }
      setSyncResult(
        `Synced: ${data.productsCreated} new product(s), ${data.productsUpdated} updated, ${data.variantsCreated} new variant(s)` +
          (data.duplicateVariants?.length ? ` — ${data.duplicateVariants.length} duplicate variant group(s) found (see below).` : ".") +
          (data.errors.length ? ` ${data.errors.length} error(s): ${data.errors.join("; ")}` : "")
      );
      setDuplicateVariants(data.duplicateVariants ?? []);
      router.refresh();
      window.location.reload();
    } catch {
      setSyncResult("Could not reach the server.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AppShell
      active="inventory"
      title="Inventory"
      desc="Synced from Shopify · cost, price and profit managed in EMS"
      tenantName={tenantName}
      userInitial={userInitial}
    >
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search product or handle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          />
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="">All status</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
          <button onClick={() => fileInputRef.current?.click()} className="mockup-btn mockup-btn-ghost">
            ⇅ Import Excel
          </button>
          <a href="/api/inventory/export" className="mockup-btn mockup-btn-ghost inline-block">
            Export
          </a>
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Pulls product listings from Shopify — creates new products, refreshes title/status/image on existing ones. Never touches cost, sale price, or on-hand for anything that already exists locally."
            className="mockup-btn mockup-btn-ghost disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "⟳ Sync with Shopify"}
          </button>
          <button
            disabled
            title="Not built yet — this would write price/stock changes back to your live Shopify store, so it's deliberately held back until Sync has been used and verified for a while first."
            className="mockup-btn mockup-btn-ghost opacity-50 cursor-not-allowed"
          >
            Push Updates to Shopify
          </button>
          <button onClick={() => setShowAddModal(true)} className="mockup-btn mockup-btn-primary">
            + Add Product
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between mb-3 px-4 py-2 rounded-lg"
          style={{ background: "var(--bad-bg)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--bad)" }}>
            {selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} className="mockup-btn mockup-btn-ghost">
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="mockup-btn"
              style={{ background: "var(--bad)", color: "#fff" }}
            >
              {deleting ? "Deleting…" : `Delete Selected (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      {importMsg && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
          {importMsg}
        </div>
      )}

      {syncResult && (
        <div
          className="text-sm rounded-lg px-3 py-2 mb-3"
          style={syncResult.startsWith("Sync failed") || syncResult.startsWith("Could not") ? { background: "var(--bad-bg)", color: "var(--bad)" } : { background: "var(--good-bg)", color: "var(--good)" }}
        >
          {syncResult}
        </div>
      )}

      {duplicateVariants.length > 0 && (
        <div className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
          <b>Duplicate variants from before the case-sensitivity fix:</b>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {duplicateVariants.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Showing all {products.length} products ({totalVariants} total variants). <b>SKU is missing on {missingSkuCount} of {products.length} products</b> —
        true of your actual Shopify export. Photos: {withPhotoCount}/{products.length} fetched live from aimexa.store, the rest show a placeholder.
      </div>

      <div className="mockup-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && selectedIds.size === paged.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("title")}>
                  Product<SortArrow active={sortKey === "title"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("variantCount")}>
                  Variant<SortArrow active={sortKey === "variantCount"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("skuLabel")}>
                  SKU<SortArrow active={sortKey === "skuLabel"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("minCost")}>
                  Cost<SortArrow active={sortKey === "minCost"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("minPrice")}>
                  Sale Price<SortArrow active={sortKey === "minPrice"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("totalOnHand")}>
                  On Hand<SortArrow active={sortKey === "totalOnHand"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("profitPerUnit")}>
                  Profit / unit<SortArrow active={sortKey === "profitPerUnit"} dir={sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("statusLabel")}>
                  Status<SortArrow active={sortKey === "statusLabel"} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const st = statusOf(p);
                const profit =
                  p.minPrice != null && p.minCost != null ? p.minPrice - p.minCost : null;
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/dashboard/inventory/${p.id}`)}
                    className="cursor-pointer hover:bg-slate-50"
                    style={{ borderTop: "1px solid var(--line)" }}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            loading="lazy"
                            className="w-9 h-9 rounded-md object-cover border flex-shrink-0"
                            style={{ borderColor: "var(--line)" }}
                          />
                        ) : (
                          <span
                            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 text-sm border"
                            style={{ background: "#EDEBE4", borderColor: "var(--line)" }}
                          >
                            👕
                          </span>
                        )}
                        <span className="font-medium">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                      {p.variantCount} variant{p.variantCount !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                      {p.hasMissingSku ? "— missing —" : "assigned"}
                    </td>
                    <td className="px-4 py-3">{priceRange(p.minCost, p.maxCost)}</td>
                    <td className="px-4 py-3">{priceRange(p.minPrice, p.maxPrice)}</td>
                    <td className="px-4 py-3 font-medium">{p.totalOnHand}</td>
                    <td className="px-4 py-3" style={{ color: profit != null ? "var(--good)" : "var(--muted)" }}>
                      {fmtRs(profit)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={"mockup-tag " + st.cls}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No products match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} pageCount={pageCount} setPage={setPage} total={total} pageSize={pageSize} />
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold mb-1">Add Product</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              Creates the product with its first variant.
            </p>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Title</label>
                <input name="title" required className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Color</label>
                  <input name="option1Value" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Size</label>
                  <input name="option2Value" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Cost (Rs)</label>
                  <input name="costPrice" type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Price (Rs)</label>
                  <input name="salePrice" type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">On Hand</label>
                  <input name="onHand" type="number" defaultValue={0} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
              </div>
              {error && (
                <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="mockup-btn mockup-btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">
                  {saving ? "Saving…" : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
