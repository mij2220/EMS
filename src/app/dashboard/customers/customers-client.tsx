"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";
import { usePagination, PaginationControls } from "@/lib/use-pagination";

type Customer = { id: string; name: string; phone: string; city: string; orderCount: number; lifetimeValue: number; returnCount: number };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function CustomersClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const filteredCustomers = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.city.toLowerCase().includes(q);
  });
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(filteredCustomers, "name");
  const { paged, page, setPage, pageCount, pageSize, total } = usePagination(sorted, 20);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []));
  }, []);

  return (
    <AppShell active="customers" title="Customers" desc="Customer master, order history and repeat-buyer report" tenantName={tenantName} userInitial={userInitial}>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search name, phone, or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)" }}
        />
      </div>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                Name<SortArrow active={sortKey === "name"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("phone")}>
                Phone<SortArrow active={sortKey === "phone"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("city")}>
                City<SortArrow active={sortKey === "city"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("orderCount")}>
                Orders<SortArrow active={sortKey === "orderCount"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("lifetimeValue")}>
                Lifetime Value<SortArrow active={sortKey === "lifetimeValue"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("returnCount")}>
                Returns<SortArrow active={sortKey === "returnCount"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{c.phone}</td>
                <td className="px-4 py-3">{c.city}</td>
                <td className="px-4 py-3">{c.orderCount}</td>
                <td className="px-4 py-3">{fmtRs(c.lifetimeValue)}</td>
                <td className="px-4 py-3">{c.returnCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls page={page} pageCount={pageCount} setPage={setPage} total={total} pageSize={pageSize} />
      </div>
    </AppShell>
  );
}
