"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  twoFaEnabled: boolean;
  lastLoginAt: string | null;
  roleName: string;
};

type Integration = {
  id: string;
  provider: string;
  storeUrl: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export default function AdminClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(users, "name");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showShopifyForm, setShowShopifyForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadIntegrations = useCallback(() => {
    fetch("/api/admin/integrations")
      .then((r) => r.json())
      .then((d) => setIntegrations(d.integrations ?? []));
  }, []);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
    loadIntegrations();
  }, [loadIntegrations]);

  const shopify = integrations.find((i) => i.provider === "shopify");

  async function handleSaveShopify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    setTestResult(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "shopify",
          storeUrl: form.get("storeUrl"),
          accessToken: form.get("accessToken"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong.");
        return;
      }
      setShowShopifyForm(false);
      loadIntegrations();
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "shopify" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({ ok: true, message: `Connected — Shopify confirmed the store as "${data.shopName}".` });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Connection test failed." });
      }
      loadIntegrations();
    } catch {
      setTestResult({ ok: false, message: "Could not reach the server." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AppShell active="admin" title="Admin" desc="Users, roles & permissions, integrations, company settings and audit log" tenantName={tenantName} userInitial={userInitial}>
      <h2 className="text-lg font-bold mb-3">Integrations</h2>
      <div className="mockup-card mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-semibold flex items-center gap-2">
              Shopify
              {shopify && (
                <span
                  className={
                    "mockup-tag " +
                    (shopify.status === "connected" ? "mockup-tag-good" : shopify.status === "error" ? "mockup-tag-bad" : "mockup-tag-neutral")
                  }
                >
                  {shopify.status}
                </span>
              )}
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {shopify?.storeUrl ? shopify.storeUrl : "Not connected yet"}
              {shopify?.lastSyncAt && ` · last verified ${new Date(shopify.lastSyncAt).toLocaleString()}`}
            </div>
            {shopify?.lastError && (
              <div className="text-sm mt-1" style={{ color: "var(--bad)" }}>
                {shopify.lastError}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {shopify && (
              <button onClick={handleTestConnection} disabled={testing} className="mockup-btn mockup-btn-ghost disabled:opacity-50">
                {testing ? "Testing…" : "Test Connection"}
              </button>
            )}
            <button onClick={() => setShowShopifyForm(true)} className="mockup-btn mockup-btn-primary">
              {shopify ? "Update Credentials" : "Connect Shopify"}
            </button>
          </div>
        </div>
        {testResult && (
          <div
            className="text-sm rounded-lg px-3 py-2 mt-3"
            style={{ background: testResult.ok ? "var(--good-bg)" : "var(--bad-bg)", color: testResult.ok ? "var(--good)" : "var(--bad)" }}
          >
            {testResult.message}
          </div>
        )}
      </div>
      <div className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        The actual Sync / Push buttons on the Inventory page stay disabled until this is connected and
        tested — and even then, pulling products in and pushing price/stock changes out is a separate
        piece of work not built yet. This page only handles the credential connection itself.
      </div>

      <h2 className="text-lg font-bold mb-3">Users</h2>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                Name<SortArrow active={sortKey === "name"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("email")}>
                Email<SortArrow active={sortKey === "email"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("roleName")}>
                Role<SortArrow active={sortKey === "roleName"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("twoFaEnabled")}>
                2FA<SortArrow active={sortKey === "twoFaEnabled"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("lastLoginAt")}>
                Last Login<SortArrow active={sortKey === "lastLoginAt"} dir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort("status")}>
                Status<SortArrow active={sortKey === "status"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                  {u.email}
                </td>
                <td className="px-4 py-3">{u.roleName}</td>
                <td className="px-4 py-3">
                  <span className={"mockup-tag " + (u.twoFaEnabled ? "mockup-tag-good" : "mockup-tag-neutral")}>{u.twoFaEnabled ? "Enabled" : "Off"}</span>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={"mockup-tag " + (u.status === "active" ? "mockup-tag-good" : "mockup-tag-warn")}>{u.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mockup-card mt-6 text-sm" style={{ color: "var(--muted)" }}>
        Roles, permission matrix editor, company settings, and audit log are on the mockup but not wired
        to this database yet — the seed script currently gives the Owner role full access directly,
        matching SRD Section 10.3&apos;s decision to ship fixed roles first.
      </div>

      {showShopifyForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowShopifyForm(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Connect Shopify</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              From a custom app in Shopify Admin → Settings → Apps and sales channels → Develop apps.
            </p>
            <form onSubmit={handleSaveShopify} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Store URL</label>
                <input
                  name="storeUrl"
                  required
                  placeholder="your-store.myshopify.com"
                  defaultValue={shopify?.storeUrl ?? ""}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Admin API Access Token</label>
                <input
                  name="accessToken"
                  required
                  type="password"
                  placeholder="shpat_..."
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--line)" }}
                />
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Stored encrypted — never shown again after saving, including to you.
                </p>
              </div>
              {formError && (
                <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowShopifyForm(false)} className="mockup-btn mockup-btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
