"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Design tokens copied directly from EMS_UI_UX_Mockup.html — not approximated.
const NAVY = "#1F4E5F";
const NAVY_DEEP = "#123340";
const CLAY = "#C9722A";

const NAV_ITEMS: { key: string; label: string; icon: string; href: string; sub?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: "◧", href: "/dashboard" },
  { key: "inventory", label: "Inventory", icon: "▤", href: "/dashboard/inventory" },
  { key: "inventory-reports", label: "Reports", icon: "▸", href: "/dashboard/reports/inventory", sub: true },
  { key: "sales", label: "Sales & Delivery", icon: "↷", href: "/dashboard/sales" },
  { key: "customers", label: "Customers", icon: "▸", href: "/dashboard/customers", sub: true },
  { key: "sales-reports", label: "Reports", icon: "▸", href: "/dashboard/reports/sales", sub: true },
  { key: "accounts", label: "Accounts", icon: "₨", href: "/dashboard/accounts" },
  { key: "vendors", label: "Vendors", icon: "▸", href: "/dashboard/vendors", sub: true },
  { key: "employees", label: "Employees", icon: "▸", href: "/dashboard/employees", sub: true },
  { key: "account-reports", label: "Reports", icon: "▸", href: "/dashboard/reports/accounts", sub: true },
  { key: "courier", label: "Courier", icon: "⛟", href: "/dashboard/courier" },
  { key: "courier-reports", label: "Reports", icon: "▸", href: "/dashboard/reports/courier", sub: true },
  { key: "admin", label: "Admin", icon: "⚙", href: "/dashboard/admin" },
];

export default function AppShell({
  active,
  title,
  desc,
  tenantName,
  userInitial,
  children,
}: {
  active: string;
  title: string;
  desc: string;
  tenantName: string;
  userInitial: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#F6F5F1" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={
          "w-[230px] flex-shrink-0 flex flex-col py-[22px] fixed md:static inset-y-0 left-0 z-50 transition-transform " +
          (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
        style={{ background: NAVY_DEEP, color: "#fff" }}
      >
        <div className="px-[22px] pb-[22px] mb-3.5 border-b border-white/10">
          <div className="font-extrabold text-lg tracking-tight">EMS</div>
          <div className="text-[11px] text-[#9FB6BE] mt-0.5 uppercase tracking-wide">{tenantName}</div>
        </div>
        <ul className="flex-1 list-none m-0 p-0">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            return (
              <li key={item.key}>
                <a
                  href={item.href}
                  className={
                    "flex items-center gap-2.5 text-[14px] font-semibold cursor-pointer border-l-[3px] " +
                    (item.sub ? "py-2 pl-[46px] pr-[22px] text-[12.5px] font-semibold" : "py-[11px] px-[22px]")
                  }
                  style={{
                    color: isActive ? "#fff" : item.sub ? "#9FB2B8" : "#C7D6DA",
                    background: isActive ? "rgba(255,255,255,.08)" : "transparent",
                    borderLeftColor: isActive ? CLAY : "transparent",
                  }}
                >
                  <span className="w-[18px] text-center text-[14px] opacity-90">{item.icon}</span>
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="px-[22px] py-3.5 text-[11px] text-[#7C939A] border-t border-white/10">
          EMS — Day-by-day build, following the validated mockup
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-slate-200 px-7 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button className="md:hidden text-xl" onClick={() => setSidebarOpen(true)}>
              ☰
            </button>
            <div className="min-w-0">
              <div className="text-[20px] font-extrabold text-slate-900 truncate">{title}</div>
              <div className="text-[12.5px] text-slate-500 truncate">{desc}</div>
            </div>
          </div>
          <div className="flex items-center gap-3.5 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-[34px] h-[34px] rounded-full text-white flex items-center justify-center font-bold text-[13px]"
                style={{ background: NAVY }}
              >
                {userInitial}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 bg-white border border-slate-200 rounded-lg shadow-lg w-40 p-1.5 z-10">
                  <a href="/dashboard/admin" className="block text-sm font-semibold rounded-md px-3 py-2 hover:bg-slate-50">
                    Admin Settings
                  </a>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left text-sm font-semibold rounded-md px-3 py-2 hover:bg-slate-50"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 p-7">{children}</div>
      </div>
    </div>
  );
}
