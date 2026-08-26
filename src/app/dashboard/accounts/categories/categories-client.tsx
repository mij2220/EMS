"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/app-shell";

type Subcategory = { id: string; name: string };
type Category = { id: string; name: string; subcategories: Subcategory[] };

export default function CategoriesClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [editingSub, setEditingSub] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/accounts/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    setError(null);
    const res = await fetch("/api/accounts/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setNewCategoryName("");
    load();
  }

  async function saveEditCategory() {
    if (!editingCategory) return;
    setError(null);
    const res = await fetch(`/api/accounts/categories/${editingCategory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingCategory.name }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setEditingCategory(null);
    load();
  }

  async function deleteCategory(cat: Category) {
    setError(null);
    if (!confirm(`Delete category "${cat.name}"${cat.subcategories.length ? ` and its ${cat.subcategories.length} sub-categor${cat.subcategories.length === 1 ? "y" : "ies"}` : ""}?`)) return;
    const res = await fetch(`/api/accounts/categories/${cat.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    load();
  }

  async function addSubcategory(categoryId: string) {
    if (!newSubName.trim()) return;
    setError(null);
    const res = await fetch(`/api/accounts/categories/${categoryId}/subcategories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setNewSubName("");
    setAddingSubTo(null);
    load();
  }

  async function saveEditSub() {
    if (!editingSub) return;
    setError(null);
    const res = await fetch(`/api/accounts/subcategories/${editingSub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingSub.name }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setEditingSub(null);
    load();
  }

  async function deleteSubcategory(sub: Subcategory) {
    setError(null);
    if (!confirm(`Delete sub-category "${sub.name}"?`)) return;
    const res = await fetch(`/api/accounts/subcategories/${sub.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    load();
  }

  return (
    <AppShell active="categories" title="Categories" desc="Manage expense categories and sub-categories used across vouchers" tenantName={tenantName} userInitial={userInitial}>
      {error && (
        <div className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
          {error}
        </div>
      )}

      <div className="mockup-card mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New category name (e.g. Marketing)"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
          />
          <button onClick={addCategory} className="mockup-btn mockup-btn-primary">
            + Add Category
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat.id} className="mockup-card !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: expanded.has(cat.id) ? "1px solid var(--line)" : "none" }}>
              <button onClick={() => toggleExpand(cat.id)} className="flex items-center gap-2 text-left flex-1">
                <span style={{ transform: expanded.has(cat.id) ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>▸</span>
                {editingCategory?.id === cat.id ? (
                  <input
                    autoFocus
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ id: cat.id, name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.key === "Enter" && saveEditCategory()}
                    className="rounded-lg border px-2 py-1 text-sm"
                    style={{ borderColor: "var(--line)" }}
                  />
                ) : (
                  <span className="font-semibold">{cat.name}</span>
                )}
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {cat.subcategories.length > 0 ? `${cat.subcategories.length} sub-categor${cat.subcategories.length === 1 ? "y" : "ies"}` : "no sub-categories"}
                </span>
              </button>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                {editingCategory?.id === cat.id ? (
                  <>
                    <button onClick={saveEditCategory} className="text-xs font-semibold" style={{ color: "var(--good)" }}>Save</button>
                    <button onClick={() => setEditingCategory(null)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setAddingSubTo(addingSubTo === cat.id ? null : cat.id)} className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
                      + Sub-category
                    </button>
                    <button onClick={() => setEditingCategory({ id: cat.id, name: cat.name })} className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
                      Edit
                    </button>
                    <button onClick={() => deleteCategory(cat)} className="text-xs font-semibold" style={{ color: "var(--bad)" }}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {expanded.has(cat.id) && (
              <div className="px-4 py-3" style={{ background: "var(--paper)" }}>
                {addingSubTo === cat.id && (
                  <div className="flex gap-2 mb-3">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Sub-category name (e.g. Meta Ads)"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSubcategory(cat.id)}
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--line)" }}
                    />
                    <button onClick={() => addSubcategory(cat.id)} className="mockup-btn mockup-btn-primary">
                      Add
                    </button>
                  </div>
                )}
                {cat.subcategories.length === 0 && !addingSubTo && (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    No sub-categories yet.
                  </div>
                )}
                <div className="space-y-1">
                  {cat.subcategories.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between py-1.5">
                      {editingSub?.id === sub.id ? (
                        <input
                          autoFocus
                          value={editingSub.name}
                          onChange={(e) => setEditingSub({ id: sub.id, name: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && saveEditSub()}
                          className="rounded-lg border px-2 py-1 text-sm"
                          style={{ borderColor: "var(--line)" }}
                        />
                      ) : (
                        <span className="text-sm">— {sub.name}</span>
                      )}
                      <div className="flex gap-2">
                        {editingSub?.id === sub.id ? (
                          <>
                            <button onClick={saveEditSub} className="text-xs font-semibold" style={{ color: "var(--good)" }}>Save</button>
                            <button onClick={() => setEditingSub(null)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setEditingSub({ id: sub.id, name: sub.name })} className="text-xs font-semibold" style={{ color: "var(--navy)" }}>Edit</button>
                            <button onClick={() => deleteSubcategory(sub)} className="text-xs font-semibold" style={{ color: "var(--bad)" }}>Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            No categories yet — add one above.
          </div>
        )}
      </div>
    </AppShell>
  );
}
