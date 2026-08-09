"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type StockValuation = { totalCostValue: number; totalRetailValue: number; topProducts: { title: string; onHand: number; costValue: number; retailValue: number }[] };
type Sales = { orderCount: number; grossSales: number; netSales: number };
type ProfitLoss = { revenue: number; cogs: number; grossProfit: number; expenses: number; netProfit: number };
type DayBookRow = { id: string; voucherDate: string; voucherType: string; reference: string | null; amount: number; delta: number; runningBalance: number };
type CourierSummaryRow = { courierId: string; courierName: string; outstandingBalance: number; orderCount: number; deliveredCount: number; returnedCount: number };
type PayableRow = { vendorId: string; vendorName: string; payableBalance: number; lastActivity: string | null };
type ExpenseCategoryRow = { category: string; total: number };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

const VALID_TABS = ["valuation", "sales", "pl", "daybook", "courier", "payable", "expenses"] as const;
type TabKey = (typeof VALID_TABS)[number];

export default function ReportsClient({
  tenantName,
  userInitial,
  initialTab,
  activeNavKey,
}: {
  tenantName: string;
  userInitial: string;
  initialTab?: string;
  activeNavKey: string;
}) {
  const router = useRouter();
  const startingTab: TabKey = VALID_TABS.includes(initialTab as TabKey) ? (initialTab as TabKey) : "valuation";
  const [tab, setTab] = useState<TabKey>(startingTab);
  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [sales, setSales] = useState<Sales | null>(null);
  const [pl, setPl] = useState<ProfitLoss | null>(null);
  const [dayBook, setDayBook] = useState<DayBookRow[]>([]);
  const [courierSummary, setCourierSummary] = useState<CourierSummaryRow[]>([]);
  const [payable, setPayable] = useState<PayableRow[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryRow[]>([]);

  const courierSort = useSortableTable(courierSummary, "courierName");
  const payableSort = useSortableTable(payable, "vendorName");
  const expenseSort = useSortableTable(expenseCategories, "total");

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then((d) => {
        setValuation(d.stockValuation);
        setSales(d.sales);
        setPl(d.profitLoss);
        setDayBook(d.dayBook ?? []);
        setCourierSummary(d.courierSummary ?? []);
        setPayable(d.payable ?? []);
        setExpenseCategories(d.expenseCategories ?? []);
      });
  }, []);

  const TABS = [
    { key: "valuation", label: "Stock Valuation" },
    { key: "sales", label: "Sales Summary" },
    { key: "pl", label: "Profit & Loss" },
    { key: "daybook", label: "Daily Account Report" },
    { key: "courier", label: "Receivable" },
    { key: "payable", label: "Payable" },
    { key: "expenses", label: "Expense Breakdown" },
  ] as const;

  return (
    <AppShell active={activeNavKey} title="Reports" desc="Stock valuation, sales, profit & loss, daily account report, and courier summary — computed live" tenantName={tenantName} userInitial={userInitial}>
      <div className="flex gap-1 mb-4 border-b overflow-x-auto" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-bold whitespace-nowrap"
            style={{ color: tab === t.key ? "var(--navy)" : "var(--muted)", borderBottom: tab === t.key ? "2px solid var(--clay)" : "2px solid transparent" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "valuation" && valuation && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="mockup-card">
              <div className="mockup-kpi-label">Total Cost Value</div>
              <div className="mockup-kpi-value">{fmtRs(valuation.totalCostValue)}</div>
            </div>
            <div className="mockup-card">
              <div className="mockup-kpi-label">Total Retail Value</div>
              <div className="mockup-kpi-value">{fmtRs(valuation.totalRetailValue)}</div>
            </div>
            <div className="mockup-card">
              <div className="mockup-kpi-label">Potential Profit</div>
              <div className="mockup-kpi-value">{fmtRs(valuation.totalRetailValue - valuation.totalCostValue)}</div>
            </div>
          </div>
          <div className="mockup-card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
                <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">On Hand</th>
                  <th className="px-4 py-3">Cost Value</th>
                  <th className="px-4 py-3">Retail Value</th>
                </tr>
              </thead>
              <tbody>
                {valuation.topProducts.map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-4 py-3 font-medium">{p.title}</td>
                    <td className="px-4 py-3">{p.onHand}</td>
                    <td className="px-4 py-3">{fmtRs(p.costValue)}</td>
                    <td className="px-4 py-3">{fmtRs(p.retailValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "sales" && sales && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="mockup-card">
            <div className="mockup-kpi-label">Orders</div>
            <div className="mockup-kpi-value">{sales.orderCount}</div>
          </div>
          <div className="mockup-card">
            <div className="mockup-kpi-label">Gross Sales</div>
            <div className="mockup-kpi-value">{fmtRs(sales.grossSales)}</div>
          </div>
          <div className="mockup-card">
            <div className="mockup-kpi-label">Net Sales (excl. returns)</div>
            <div className="mockup-kpi-value">{fmtRs(sales.netSales)}</div>
          </div>
        </div>
      )}

      {tab === "pl" && pl && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="px-4 py-3 font-bold">Revenue</td>
                <td className="px-4 py-3 text-right">{fmtRs(pl.revenue)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 pl-8" style={{ color: "var(--muted)" }}>Cost of Goods Sold</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--bad)" }}>− {fmtRs(pl.cogs)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--line)", background: "var(--paper)", fontWeight: 700 }}>
                <td className="px-4 py-3">Gross Profit</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--good)" }}>{fmtRs(pl.grossProfit)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 pl-8" style={{ color: "var(--muted)" }}>Expenses (incl. salary)</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--bad)" }}>− {fmtRs(pl.expenses)}</td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--line)", background: pl.netProfit >= 0 ? "var(--good-bg)" : "var(--bad-bg)", fontWeight: 800 }}>
                <td className="px-4 py-3">Net Profit / (Loss)</td>
                <td className="px-4 py-3 text-right" style={{ color: pl.netProfit >= 0 ? "var(--good)" : "var(--bad)" }}>{fmtRs(pl.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "daybook" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
                <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Voucher</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {dayBook.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-4 py-3">{new Date(r.voucherDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{r.voucherType}</td>
                    <td className="px-4 py-3">{r.reference}</td>
                    <td className="px-4 py-3" style={{ color: r.delta > 0 ? "var(--good)" : "var(--bad)" }}>
                      {r.delta > 0 ? "+" : ""}
                      {fmtRs(r.delta)}
                    </td>
                    <td className="px-4 py-3 font-medium">{fmtRs(r.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
            This running balance should always match the Cash Balance KPI on Accounts — that&apos;s the check that proves this report is real, not decorative.
          </div>
        </div>
      )}

      {tab === "courier" && (
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
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Returned</th>
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
      )}

      {tab === "payable" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => payableSort.toggleSort("vendorName")}>
                  Vendor<SortArrow active={payableSort.sortKey === "vendorName"} dir={payableSort.sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => payableSort.toggleSort("payableBalance")}>
                  Payable Balance<SortArrow active={payableSort.sortKey === "payableBalance"} dir={payableSort.sortDir} />
                </th>
                <th className="px-4 py-3">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {payableSort.sorted.map((p) => (
                <tr
                  key={p.vendorId}
                  onClick={() => router.push(`/dashboard/vendors/${p.vendorId}`)}
                  className="cursor-pointer hover:bg-slate-50"
                  style={{ borderTop: "1px solid var(--line)" }}
                >
                  <td className="px-4 py-3 font-medium">{p.vendorName}</td>
                  <td className="px-4 py-3">{fmtRs(p.payableBalance)}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {p.lastActivity ? new Date(p.lastActivity).toLocaleDateString() : "No purchases yet"}
                  </td>
                </tr>
              ))}
              {payable.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No vendors set up yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
            Click a vendor to see exactly how its balance was built up — every purchase and payment, in order.
          </div>
        </div>
      )}

      {tab === "expenses" && (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => expenseSort.toggleSort("category")}>
                  Category<SortArrow active={expenseSort.sortKey === "category"} dir={expenseSort.sortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => expenseSort.toggleSort("total")}>
                  Total<SortArrow active={expenseSort.sortKey === "total"} dir={expenseSort.sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {expenseSort.sorted.map((c) => (
                <tr key={c.category} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3 font-medium">{c.category}</td>
                  <td className="px-4 py-3">{fmtRs(c.total)}</td>
                </tr>
              ))}
              {expenseCategories.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No expenses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
            Includes salary as its own category — matches the &quot;Expenses (incl. salary)&quot; line on the Profit &amp; Loss tab.
          </div>
        </div>
      )}
    </AppShell>
  );
}
