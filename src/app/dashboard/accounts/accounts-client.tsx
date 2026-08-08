"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/app-shell";

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [modal, setModal] = useState<null | "expense" | "salary" | "vendor" | "voucher">(null);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Voucher</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Debit</th>
                <th className="px-4 py-3">Credit</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid var(--line)" }}>
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
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-3">
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
