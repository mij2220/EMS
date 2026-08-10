"use client";

import { useState, useMemo, useEffect } from "react";

/**
 * Generic client-side pagination, meant to compose with useSortableTable:
 * sort first, then paginate the sorted result. Resets to page 1 whenever
 * the underlying data length changes (new search/filter applied) so you
 * never end up stuck on a now-empty page 4 after narrowing a search.
 */
export function usePagination<T>(data: T[], pageSize = 20) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [data.length]);

  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  return { paged, page: safePage, setPage, pageCount, pageSize, total: data.length };
}

export function PaginationControls({
  page,
  pageCount,
  setPage,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  setPage: (p: number) => void;
  total: number;
  pageSize: number;
}) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm" style={{ borderTop: "1px solid var(--line)", color: "var(--muted)" }}>
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded-md border text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: "var(--line)" }}
        >
          ← Prev
        </button>
        <span className="px-2 text-xs">
          Page {page} of {pageCount}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= pageCount}
          className="px-2.5 py-1 rounded-md border text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: "var(--line)" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
