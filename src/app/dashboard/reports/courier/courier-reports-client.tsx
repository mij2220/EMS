"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type CourierSummaryRow = { courierId: string; courierName: string; outstandingBalance: number; orderCount: number; deliveredCount: number; returnedCount: number };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function CourierReportsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [courierSummary, setCourierSummary] = useState<CourierSummaryRow[]>([]);
  const courierSort = useSortableTable(courierSummary, "courierName");

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then((d) => setCourierSummary(d.courierSummary ?? []));
  }, []);

  return (
    <AppShell active="courier-reports" title="Courier Reports" desc="Receivable — computed live" tenantName={tenantName} userInitial={userInitial}>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => courierSort.toggleSort("courierName")}>
                Courier<SortArrow active={courierSort.sortKey === "courierName"} dir={courierSort.sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => courierSort.toggleSort("outstandingBalance")}>
                Outstanding Balance<SortArrow active={courierSort.sortKey === "outstandingBalance"} dir={courierSort.sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => courierSort.toggleSort("orderCount")}>
                Orders<SortArrow active={courierSort.sortKey === "orderCount"} dir={courierSort.sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => courierSort.toggleSort("deliveredCount")}>
                Delivered<SortArrow active={courierSort.sortKey === "deliveredCount"} dir={courierSort.sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => courierSort.toggleSort("returnedCount")}>
                Returned<SortArrow active={courierSort.sortKey === "returnedCount"} dir={courierSort.sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {courierSort.sorted.map((c) => (
              <tr
                key={c.courierId}
                onClick={() => router.push(`/dashboard/courier/${c.courierId}`)}
                className="cursor-pointer hover:bg-slate-50"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <td className="px-4 py-3 font-medium">{c.courierName}</td>
                <td className="px-4 py-3">{fmtRs(c.outstandingBalance)}</td>
                <td className="px-4 py-3">{c.orderCount}</td>
                <td className="px-4 py-3" style={{ color: "var(--good)" }}>{c.deliveredCount}</td>
                <td className="px-4 py-3" style={{ color: "var(--bad)" }}>{c.returnedCount}</td>
              </tr>
            ))}
            {courierSummary.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No couriers set up yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
          Click a courier to see exactly how its balance was built up — every dispatch credit and remittance debit, in order.
        </div>
        <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
          Outstanding Balance here should match each courier&apos;s balance on the Courier module&apos;s own detail page — same underlying vouchers, computed the same way.
        </div>
      </div>
    </AppShell>
  );
}
