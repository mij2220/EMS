"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";

type Courier = {
  id: string;
  name: string;
  mode: string;
  remittanceCycleDays: number;
  commissionPercent: number;
  commissionFlat: number;
  outstandingBalance: number;
  orderCount: number;
};

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function CourierClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);

  useEffect(() => {
    fetch("/api/couriers")
      .then((r) => r.json())
      .then((d) => setCouriers(d.couriers ?? []));
  }, []);

  return (
    <AppShell active="courier" title="Courier" desc="Per-courier accounts, remittance cycles and COD variance" tenantName={tenantName} userInitial={userInitial}>
      <div className="flex justify-end mb-4">
        <a href="/api/couriers/export" className="mockup-btn mockup-btn-ghost inline-block">
          Export
        </a>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {couriers.map((c) => (
          <div key={c.id} onClick={() => router.push(`/dashboard/courier/${c.id}`)} className="mockup-card cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold">{c.name}</span>
              <span className={"mockup-tag " + (c.mode === "api_and_manual" ? "mockup-tag-good" : "mockup-tag-neutral")}>{c.mode}</span>
            </div>
            <div className="text-sm space-y-1" style={{ color: "var(--muted)" }}>
              <div className="flex justify-between">
                <span>Outstanding</span>
                <b style={{ color: "var(--ink)" }}>{fmtRs(c.outstandingBalance)}</b>
              </div>
              <div className="flex justify-between">
                <span>Remittance cycle</span>
                <span>{c.remittanceCycleDays} days</span>
              </div>
              <div className="flex justify-between">
                <span>Orders</span>
                <span>{c.orderCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
