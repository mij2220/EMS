"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app-shell";

type Sales = { orderCount: number; grossSales: number; netSales: number };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function SalesReportsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [sales, setSales] = useState<Sales | null>(null);

  useEffect(() => {
    fetch("/api/reports/summary")
      .then((r) => r.json())
      .then((d) => setSales(d.sales));
  }, []);

  return (
    <AppShell active="sales-reports" title="Sales Reports" desc="Sales summary — computed live" tenantName={tenantName} userInitial={userInitial}>
      {sales && (
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
    </AppShell>
  );
}
