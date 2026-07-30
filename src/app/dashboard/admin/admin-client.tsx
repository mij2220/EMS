"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/app-shell";

type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  twoFaEnabled: boolean;
  lastLoginAt: string | null;
  roleName: string;
};

export default function AdminClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
  }, []);

  return (
    <AppShell active="admin" title="Admin" desc="Users, roles & permissions, integrations, company settings and audit log" tenantName={tenantName} userInitial={userInitial}>
      <div className="mockup-card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">2FA</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{u.email}</td>
                <td className="px-4 py-3">{u.roleName}</td>
                <td className="px-4 py-3">
                  <span className={"mockup-tag " + (u.twoFaEnabled ? "mockup-tag-good" : "mockup-tag-neutral")}>{u.twoFaEnabled ? "Enabled" : "Off"}</span>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-3">
                  <span className={"mockup-tag " + (u.status === "active" ? "mockup-tag-good" : "mockup-tag-warn")}>{u.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mockup-card mt-6 text-sm" style={{ color: "var(--muted)" }}>
        Roles, permission matrix editor, integration settings, company settings, and audit log are on the
        mockup but not wired to this database yet — the seed script currently gives the Owner role full
        access directly, matching SRD Section 10.3&apos;s decision to ship fixed roles first.
      </div>
    </AppShell>
  );
}
