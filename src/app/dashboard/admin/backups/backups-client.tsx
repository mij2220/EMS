"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";

type Backup = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  isPreRestoreSnapshot: boolean;
  createdByName: string | null;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Restore confirmation state — nothing here ever fires the actual
  // restore request until confirmText exactly matches CONFIRM_PHRASE,
  // typed fresh each time (not remembered/pre-filled).
  const [restoreTarget, setRestoreTarget] = useState<{ type: "backup"; id: string } | { type: "file"; file: File } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; message: string } | null>(null);

  function loadBackups() {
    fetch("/api/admin/backups")
      .then((r) => r.json())
      .then((d) => {
        setBackups(d.backups ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadBackups();
  }, []);

  async function handleCreateBackup() {
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCreateResult({ ok: false, message: data.error ?? "Backup failed." });
        return;
      }
      setCreateResult({ ok: true, message: `Backup created (${formatSize(data.sizeBytes)}).` });
      loadBackups();
    } catch {
      setCreateResult({ ok: false, message: "Could not reach the server." });
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const form = new FormData();
      form.set("confirmText", confirmText);
      if (restoreTarget.type === "backup") form.set("backupId", restoreTarget.id);
      else form.set("file", restoreTarget.file);

      const res = await fetch("/api/admin/backups/restore", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setRestoreResult({ ok: false, message: data.error ?? "Restore failed." });
        return;
      }
      setRestoreResult({
        ok: true,
        message: "Restore complete. A safety snapshot of the previous state was saved automatically before this ran. Reload the app and check your data.",
      });
      setRestoreTarget(null);
      setConfirmText("");
      loadBackups();
    } catch {
      setRestoreResult({ ok: false, message: "Could not reach the server." });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <AppShell active="admin" title="Database Backups" desc="Full-database backup and restore — up to 2 most recent kept" tenantName={tenantName} userInitial={userInitial}>
      <Link href="/dashboard/admin" className="text-sm mb-4 inline-block" style={{ color: "var(--muted)" }}>
        ← Back to Admin
      </Link>

      <div className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>
        Restoring replaces the ENTIRE live database with the selected backup's contents. Every order, customer, voucher, and
        product created or changed after that backup&apos;s timestamp will be gone. A safety snapshot of the current state is
        always taken automatically right before any restore, but this is still a serious, hard-to-fully-undo action — only
        the Owner role can do this, and it requires typing a confirmation phrase.
      </div>

      <div className="mockup-card mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-semibold">Create a backup now</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Full database dump, stored securely — only the 2 most recent backups are kept.
          </div>
        </div>
        <button onClick={handleCreateBackup} disabled={creating} className="mockup-btn mockup-btn-primary disabled:opacity-50">
          {creating ? "Creating…" : "Create Backup Now"}
        </button>
      </div>

      {createResult && (
        <div
          className="text-sm rounded-lg px-3 py-2 mb-4"
          style={{ background: createResult.ok ? "var(--good-bg)" : "var(--bad-bg)", color: createResult.ok ? "var(--good)" : "var(--bad)" }}
        >
          {createResult.message}
        </div>
      )}

      <h2 className="text-lg font-bold mb-3">Stored Backups</h2>
      {loading ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </div>
      ) : backups.length === 0 ? (
        <div className="mockup-card text-sm mb-6" style={{ color: "var(--muted)" }}>
          No backups yet — click &quot;Create Backup Now&quot; above.
        </div>
      ) : (
        <div className="mockup-card !p-0 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-soft)", color: "var(--muted)" }}>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{b.createdByName ?? "—"}</td>
                  <td className="px-4 py-3">{formatSize(b.sizeBytes)}</td>
                  <td className="px-4 py-3">
                    {b.isPreRestoreSnapshot ? (
                      <span className="mockup-tag mockup-tag-warn">pre-restore snapshot</span>
                    ) : (
                      <span className="mockup-tag mockup-tag-neutral">manual</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <a href={`/api/admin/backups/${b.id}/download`} className="underline" style={{ color: "var(--muted)" }}>
                        Download
                      </a>
                      <button
                        onClick={() => {
                          setRestoreTarget({ type: "backup", id: b.id });
                          setConfirmText("");
                          setRestoreResult(null);
                        }}
                        className="underline"
                        style={{ color: "var(--bad)" }}
                      >
                        Restore from this
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-lg font-bold mb-3">Restore from an uploaded file</h2>
      <div className="mockup-card mb-6">
        <input
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setRestoreTarget({ type: "file", file });
              setConfirmText("");
              setRestoreResult(null);
            }
          }}
          className="text-sm"
        />
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          Must be a .json backup produced by this app&apos;s own Create Backup feature — such as one downloaded from this page.
        </p>
      </div>

      {restoreResult && (
        <div
          className="text-sm rounded-lg px-3 py-2 mb-6"
          style={{ background: restoreResult.ok ? "var(--good-bg)" : "var(--bad-bg)", color: restoreResult.ok ? "var(--good)" : "var(--bad)" }}
        >
          {restoreResult.message}
        </div>
      )}

      {restoreTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !restoring && setRestoreTarget(null)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--bad)" }}>
              Confirm database restore
            </h2>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              {restoreTarget.type === "backup"
                ? "This will replace the entire live database with this backup's contents."
                : `This will replace the entire live database with the contents of "${restoreTarget.file.name}".`}{" "}
              A safety snapshot of the current state is taken automatically first, but this cannot be casually undone.
            </p>
            <label className="block text-xs font-semibold mb-1">
              Type <code className="px-1 rounded" style={{ background: "var(--bg-soft)" }}>RESTORE</code> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
              style={{ borderColor: "var(--line)" }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRestoreTarget(null)} disabled={restoring} className="mockup-btn mockup-btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={confirmText !== "RESTORE" || restoring}
                className="mockup-btn disabled:opacity-50"
                style={{ background: "var(--bad)", color: "white" }}
              >
                {restoring ? "Restoring…" : "Restore — replace live data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
