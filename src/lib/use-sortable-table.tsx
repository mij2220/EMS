"use client";

import { useState, useMemo } from "react";

export type SortDir = "asc" | "desc";

/**
 * Generic in-memory table sorting. All the tables in this app fetch their
 * full dataset client-side already (small business, hundreds of rows at
 * most, not tens of thousands) — so sorting client-side after fetch is the
 * right tradeoff: no new API params, no re-fetch on sort, instant response.
 *
 * Usage:
 *   const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(products, "title");
 *   <th onClick={() => toggleSort("title")}>Product <SortArrow active={sortKey === "title"} dir={sortDir} /></th>
 *   {sorted.map(...)}
 */
export function useSortableTable<T extends Record<string, unknown>>(data: T[], defaultKey: keyof T | null = null) {
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggleSort };
}

/** Small arrow indicator for a sortable column header. */
export function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ opacity: 0.25 }}> ↕</span>;
  return <span style={{ color: "var(--clay)" }}>{dir === "asc" ? " ↑" : " ↓"}</span>;
}
