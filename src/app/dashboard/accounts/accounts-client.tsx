"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/app-shell";
import { useSortableTable, SortArrow } from "@/lib/use-sortable-table";

type Voucher = {
  id: string;
  voucherNumber: string;
  voucherType: string;
  voucherDate: string;
  amount: number;
  reference: string | null;
  debitAccountName: string;
  creditAccountName: string;
  enteredByName: string;
  vendorVoucherNumber: string | null;
  unitType: string | null;
  totalUnits: number | null;
  hasPhoto: boolean;
};

type Kpis = { cash: number; vendorPayable: number; courierReceivable: number; monthExpenses: number };

type Account = { id: string; name: string; type: string };
type Vendor = { id: string; name: string };
type Employee = { id: string; name: string };

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default function AccountsClient({ tenantName, userInitial }: { tenantName: string; userInitial: string }) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const { sorted: sortedVouchers, sortKey: voucherSortKey, sortDir: voucherSortDir, toggleSort: toggleVoucherSort } = useSortableTable(vouchers, "voucherDate");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [modal, setModal] = useState<null | "expense" | "salary" | "vendor" | "voucher">(null);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [k, v, a, ve, em] = await Promise.all([
      fetch("/api/accounts/kpis").then((r) => r.json()),
      fetch("/api/accounts/vouchers").then((r) => r.json()),
      fetch("/api/accounts/accounts-list").then((r) => r.json()),
      fetch("/api/vendors").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
    ]);
    setKpis(k);
    setVouchers(v.vouchers ?? []);
    setAccounts(a.accounts ?? []);
    setVendors(ve.vendors ?? []);
    setEmployees(em.employees ?? []);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <AppShell active="accounts" title="Accounts" desc="Cash, vendor, salary, expense and courier ledgers" tenantName={tenantName} userInitial={userInitial}>
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="mockup-card">
            <div className="mockup-kpi-label">Cash Balance</div>
            <div className="mockup-kpi-value">{fmtRs(kpis.cash)}</div>
          </div>
          <div className="mockup-card">
            <div className="mockup-kpi-label">Vendor Payable</div>
            <div className="mockup-kpi-value">{fmtRs(kpis.vendorPayable)}</div>
          </div>
          <div className="mockup-card">
            <div className="mockup-kpi-label">Courier Receivable</div>
            <div className="mockup-kpi-value">{fmtRs(kpis.courierReceivable)}</div>
          </div>
          <div className="mockup-card">
            <div className="mockup-kpi-label">This Month&apos;s Expenses</div>
            <div className="mockup-kpi-value">{fmtRs(kpis.monthExpenses)}</div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mb-4 flex-wrap">
        <button onClick={() => setModal("expense")} className="mockup-btn mockup-btn-ghost">
          + Expense
        </button>
        <button onClick={() => setModal("salary")} className="mockup-btn mockup-btn-ghost">
          + Salary Payment
        </button>
        <button onClick={() => setModal("vendor")} className="mockup-btn mockup-btn-ghost">
          + Vendor Purchase
        </button>
        <button onClick={() => setModal("voucher")} className="mockup-btn mockup-btn-primary">
          + New Voucher
        </button>
      </div>

      <div className="mockup-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleVoucherSort("voucherDate")}>
                  Date<SortArrow active={voucherSortKey === "voucherDate"} dir={voucherSortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleVoucherSort("voucherType")}>
                  Voucher<SortArrow active={voucherSortKey === "voucherType"} dir={voucherSortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleVoucherSort("reference")}>
                  Reference<SortArrow active={voucherSortKey === "reference"} dir={voucherSortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleVoucherSort("debitAccountName")}>
                  Debit<SortArrow active={voucherSortKey === "debitAccountName"} dir={voucherSortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleVoucherSort("creditAccountName")}>
                  Credit<SortArrow active={voucherSortKey === "creditAccountName"} dir={voucherSortDir} />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleVoucherSort("amount")}>
                  Amount<SortArrow active={voucherSortKey === "amount"} dir={voucherSortDir} />
                </th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {sortedVouchers.map((v) => (
                <tr key={v.id} onClick={() => setSelectedVoucherId(v.id)} className="cursor-pointer hover:bg-slate-50" style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-3">{new Date(v.voucherDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{v.voucherType}</td>
                  <td className="px-4 py-3">{v.reference}</td>
                  <td className="px-4 py-3">{v.debitAccountName}</td>
                  <td className="px-4 py-3">{v.creditAccountName}</td>
                  <td className="px-4 py-3 font-medium">{fmtRs(v.amount)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                    {v.vendorVoucherNumber && <div>#{v.vendorVoucherNumber}</div>}
                    {v.totalUnits != null && (
                      <div>
                        {v.totalUnits} {v.unitType ?? ""}
                      </div>
                    )}
                    {v.hasPhoto && (
                      <a
                        href={`/api/accounts/vouchers/${v.id}/photo`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1"
                        style={{ color: "var(--navy)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        📷 View photo
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No vouchers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "expense" && <ExpenseModal onClose={() => setModal(null)} onSaved={loadAll} />}
      {modal === "salary" && <SalaryModal employees={employees} onClose={() => setModal(null)} onSaved={loadAll} />}
      {modal === "vendor" && <VendorPurchaseModal vendors={vendors} onClose={() => setModal(null)} onSaved={loadAll} />}
      {modal === "voucher" && <NewVoucherModal accounts={accounts} onClose={() => setModal(null)} onSaved={loadAll} />}
      {selectedVoucherId && (
        <VoucherDetailModal voucherId={selectedVoucherId} onClose={() => setSelectedVoucherId(null)} onChanged={loadAll} />
      )}
    </AppShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function useFormSubmit(endpoint: string, onSaved: () => void, onClose: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }
  return { submit, error, saving };
}

function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { submit, error, saving } = useFormSubmit("/api/accounts/vouchers/expense", onSaved, onClose);
  return (
    <ModalShell title="Add Expense" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit({ category: f.get("category"), amount: f.get("amount"), paidFrom: f.get("paidFrom"), description: f.get("description") });
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-xs font-semibold mb-1">Category</label>
          <select name="category" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
            <option>Utility Bill</option>
            <option>Shipping / Courier Fee</option>
            <option>Packaging</option>
            <option>Rent</option>
            <option>Marketing</option>
            <option>Miscellaneous</option>
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Amount (Rs)</label>
            <input name="amount" type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Paid From</label>
            <select name="paidFrom" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              <option>Cash</option>
              <option>Bank</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Description</label>
          <input name="description" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
        </div>
        {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="mockup-btn mockup-btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save Expense"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function SalaryModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const { submit, error, saving } = useFormSubmit("/api/accounts/vouchers/salary", onSaved, onClose);
  return (
    <ModalShell title="Salary Payment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit({ employeeId: f.get("employeeId"), period: f.get("period"), amount: f.get("amount"), paidFrom: f.get("paidFrom") });
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-xs font-semibold mb-1">Employee</label>
          <select name="employeeId" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Pay Period</label>
            <input name="period" placeholder="e.g. August 2026" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Amount (Rs)</label>
            <input name="amount" type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Paid From</label>
          <select name="paidFrom" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
            <option>Cash</option>
            <option>Bank</option>
          </select>
        </div>
        {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="mockup-btn mockup-btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save Payment"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function VendorPurchaseModal({ vendors, onClose, onSaved }: { vendors: Vendor[]; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/accounts/vouchers/vendor-purchase", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoPreview(null);
      return;
    }
    setPhotoPreview(URL.createObjectURL(file));
  }

  return (
    <ModalShell title="Vendor Purchase" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Date</label>
            <input name="voucherDate" type="date" defaultValue={today} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Voucher #</label>
            <input name="vendorVoucherNumber" placeholder="e.g. from the paper slip" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Vendor</label>
          <select name="vendorId" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Item Description</label>
          <input name="itemDescription" placeholder="e.g. Fabric — cotton roll" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Unit Type</label>
            <select name="unitType" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              <option value="qty">Qty</option>
              <option value="kg">Kg</option>
              <option value="feet">Feet</option>
              <option value="meters">Meters</option>
              <option value="yards">Yards</option>
              <option value="rolls">Rolls</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Total Units</label>
            <input name="totalUnits" type="number" step="0.01" placeholder="e.g. 120" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Total Amount (Rs)</label>
          <input name="amount" type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Voucher Photo</label>
          <input name="photo" type="file" accept="image/*" onChange={handlePhotoChange} className="w-full text-sm" />
          {photoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="Voucher preview" className="mt-2 rounded-lg border max-h-40 object-contain" style={{ borderColor: "var(--line)" }} />
          )}
        </div>
        {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="mockup-btn mockup-btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save Purchase"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function NewVoucherModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const { submit, error, saving } = useFormSubmit("/api/accounts/vouchers", onSaved, onClose);
  return (
    <ModalShell title="New Voucher" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          submit({
            voucherType: f.get("voucherType"),
            debitAccountId: f.get("debitAccountId"),
            creditAccountId: f.get("creditAccountId"),
            amount: f.get("amount"),
            reference: f.get("reference"),
          });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Voucher Type</label>
            <select name="voucherType" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              <option value="cash_payment">Cash Payment</option>
              <option value="cash_receipt">Cash Receipt</option>
              <option value="journal">Journal Entry</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Amount (Rs)</label>
            <input name="amount" type="number" step="0.01" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Debit Account</label>
            <select name="debitAccountId" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Credit Account</label>
            <select name="creditAccountId" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Reference</label>
          <input name="reference" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
        </div>
        {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="mockup-btn mockup-btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Post Voucher"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

type VoucherDetail = {
  id: string;
  voucherNumber: string;
  voucherType: string;
  voucherDate: string;
  amount: number;
  reference: string | null;
  vendorVoucherNumber: string | null;
  unitType: string | null;
  totalUnits: number | null;
  createdAt: string;
  debitAccountName: string;
  creditAccountName: string;
  enteredByName: string;
  hasPhoto: boolean;
};

function VoucherDetailModal({ voucherId, onClose, onChanged }: { voucherId: string; onClose: () => void; onChanged: () => void }) {
  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/accounts/vouchers/${voucherId}`)
      .then((r) => r.json())
      .then((d) => {
        setVoucher(d.voucher ?? null);
        setLoading(false);
      });
  }, [voucherId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/accounts/vouchers/${voucherId}`, { method: "PATCH", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setEditing(false);
      load();
      onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this voucher? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/vouchers/${voucherId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onChanged();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setDeleting(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading && <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>Loading…</div>}

        {!loading && voucher && !editing && (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{voucher.voucherNumber}</h2>
                <span className="mockup-tag mockup-tag-neutral">{voucher.voucherType}</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{fmtRs(voucher.amount)}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{new Date(voucher.voucherDate).toLocaleDateString()}</div>
              </div>
            </div>
            <dl className="text-sm space-y-2 mb-4">
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Reference</dt><dd>{voucher.reference ?? "—"}</dd></div>
              {voucher.vendorVoucherNumber && (
                <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Vendor Voucher #</dt><dd>{voucher.vendorVoucherNumber}</dd></div>
              )}
              {voucher.totalUnits != null && (
                <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Units</dt><dd>{voucher.totalUnits} {voucher.unitType ?? ""}</dd></div>
              )}
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Debit</dt><dd>{voucher.debitAccountName}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Credit</dt><dd>{voucher.creditAccountName}</dd></div>
              <div className="flex justify-between"><dt style={{ color: "var(--muted)" }}>Entered by</dt><dd>{voucher.enteredByName}</dd></div>
            </dl>
            {voucher.hasPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/accounts/vouchers/${voucher.id}/photo`}
                alt="Voucher"
                className="w-full rounded-lg border mb-4"
                style={{ borderColor: "var(--line)" }}
              />
            )}
            {error && <div className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
            <div className="flex justify-between gap-2 pt-2">
              <button onClick={handleDelete} disabled={deleting} className="mockup-btn disabled:opacity-50" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="mockup-btn mockup-btn-ghost">Close</button>
                <button onClick={() => setEditing(true)} className="mockup-btn mockup-btn-primary">Edit</button>
              </div>
            </div>
          </>
        )}

        {!loading && voucher && editing && (
          <>
            <h2 className="text-lg font-bold mb-4">Edit {voucher.voucherNumber}</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Date</label>
                  <input name="voucherDate" type="date" defaultValue={voucher.voucherDate.slice(0, 10)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Vendor Voucher #</label>
                  <input name="vendorVoucherNumber" defaultValue={voucher.vendorVoucherNumber ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Reference</label>
                <input name="reference" defaultValue={voucher.reference ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Unit Type</label>
                  <input name="unitType" defaultValue={voucher.unitType ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Total Units</label>
                  <input name="totalUnits" type="number" step="0.01" defaultValue={voucher.totalUnits ?? ""} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Amount (Rs)</label>
                <input name="amount" type="number" step="0.01" defaultValue={voucher.amount} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Replace Photo</label>
                <input name="photo" type="file" accept="image/*" onChange={handlePhotoChange} className="w-full text-sm" />
                {photoPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="New photo preview" className="mt-2 rounded-lg border max-h-40 object-contain" style={{ borderColor: "var(--line)" }} />
                )}
              </div>
              {error && <div className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(false)} className="mockup-btn mockup-btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="mockup-btn mockup-btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
