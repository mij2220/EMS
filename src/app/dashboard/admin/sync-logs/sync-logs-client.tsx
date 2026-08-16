"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";

type SyncLog = {
  id: string;
  syncType: string;
  trigger: string;
  ok: boolean;
  summary: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
};

function summaryLine(log: SyncLog): string {
  const s = log.summary ?? {};
  if (log.syncType === "inventory") {
    return `${s.productsCreated ?? 0} product(s) created, ${s.productsUpdated ?? 0} updated, ${s.variantsCreated ?? 0} new variant(s)`;
  }
  if (log.syncType === "sales") {
    return `${s.ordersCreated ?? 0} order(s) created, ${s.ordersUpdated ?? 0} updated, ${s.ordersSkipped ?? 0} skipped`;
  }
  return "";
}

export default function SyncLogsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/sync-logs")
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <AppShell active="admin" title="Sync Logs" desc="Shopify auto-sync run history — kept for the last 2 days" tenantName={tenantName} userInitial={userInitial}>
      <Link href="/dashboard/admin" className="text-sm mb-4 inline-block" style={{ color: "var(--muted)" }}>
        ← Back to Admin
      </Link>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="mockup-card text-sm" style={{ color: "var(--muted)" }}>
          No sync runs logged yet. Runs are logged the moment the scheduler or a manual Sync button completes — check back after the first hourly
          run, or trigger one manually from Inventory/Sales.
        </div>
      ) : (
        <div className="mockup-card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-soft)", color: "var(--muted)" }}>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const durationMs = new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime();
                return (
                  <tr key={log.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{log.syncType}</td>
                    <td className="px-4 py-3 capitalize">{log.trigger}</td>
                    <td className="px-4 py-3">
                      <span className={"mockup-tag " + (log.ok ? "mockup-tag-good" : "mockup-tag-bad")}>{log.ok ? "ok" : "failed"}</span>
                    </td>
                    <td className="px-4 py-3">{log.ok ? summaryLine(log) : log.error}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{(durationMs / 1000).toFixed(1)}s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
