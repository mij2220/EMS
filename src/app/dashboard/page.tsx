import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "kysely";
import AppShell from "@/components/app-shell";

function fmtRs(n: number) {
  return "Rs " + Math.round(n).toLocaleString("en-US");
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;
  if (!session) redirect("/login");

  const user = await db
    .selectFrom("users")
    .innerJoin("roles", "roles.id", "users.roleId")
    .innerJoin("tenants", "tenants.id", "users.tenantId")
    .select(["users.name", "roles.name as roleName", "tenants.businessName as tenantName"])
    .where("users.id", "=", session.userId)
    .executeTakeFirstOrThrow();

  const tenantId = session.tenantId;

  // Cash balance: sum of vouchers debiting Cash minus those crediting it — same
  // logic already used for /api/dashboard/summary, kept in one place would be a
  // nice follow-up refactor (see note at the bottom of this file).
  const cashRow = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select(({ fn }) => [
      fn
        .sum<string>(sql<number>`case when debit_acct.name = 'Cash' then vouchers.amount when credit_acct.name = 'Cash' then -vouchers.amount else 0 end`)
        .as("balance"),
    ])
    .where("vouchers.tenantId", "=", tenantId)
    .executeTakeFirst();

  // Courier Receivable: sum of every account whose type = 'receivable'. Same rule
  // as Cash (both are assets): a DEBIT to the account increases its balance, a
  // CREDIT decreases it — dispatch vouchers debit Courier Receivable (money now
  // owed to us), a remittance credits it (money received clears the balance).
  const receivableRow = await db
    .selectFrom("vouchers")
    .innerJoin("accounts as debit_acct", "debit_acct.id", "vouchers.debitAccountId")
    .innerJoin("accounts as credit_acct", "credit_acct.id", "vouchers.creditAccountId")
    .select(({ fn }) => [
      fn
        .sum<string>(
          sql<number>`case when debit_acct.type = 'receivable' then vouchers.amount when credit_acct.type = 'receivable' then -vouchers.amount else 0 end`
        )
        .as("balance"),
    ])
    .where("vouchers.tenantId", "=", tenantId)
    .executeTakeFirst();

  const lowStockRow = await db
    .selectFrom("variants")
    .innerJoin("products", "products.id", "variants.productId")
    .select(({ fn }) => fn.count<string>("variants.id").as("count"))
    .where("products.tenantId", "=", tenantId)
    .where("products.status", "!=", "draft")
    .where("variants.onHand", ">", 0)
    .where("variants.onHand", "<", 50)
    .executeTakeFirst();

  const todaySalesRow = await db
    .selectFrom("orderItems")
    .innerJoin("orders", "orders.id", "orderItems.orderId")
    .select(({ fn }) => fn.sum<string>(sql<number>`order_items.qty * order_items.unit_price`).as("total"))
    .where("orders.tenantId", "=", tenantId)
    .where(sql<boolean>`orders.placed_at::date = current_date`)
    .where("orders.status", "!=", "returned")
    .executeTakeFirst();

  const recentOrders = await db
    .selectFrom("orders")
    .innerJoin("customers", "customers.id", "orders.customerId")
    .leftJoin("couriers", "couriers.id", "orders.courierId")
    .select(({ fn }) => [
      "orders.id",
      "orders.orderNumber",
      "orders.status",
      "orders.paymentType",
      "customers.name as customerName",
      "customers.city",
      "couriers.name as courierName",
    ])
    .where("orders.tenantId", "=", tenantId)
    .orderBy("orders.placedAt", "desc")
    .limit(5)
    .execute();

  const orderTotals = await Promise.all(
    recentOrders.map((o) =>
      db
        .selectFrom("orderItems")
        .select(({ fn }) => fn.sum<string>(sql<number>`qty * unit_price`).as("total"))
        .where("orderId", "=", o.id)
        .executeTakeFirst()
    )
  );

  const cashBalance = Number(cashRow?.balance ?? 0);
  const courierReceivable = Number(receivableRow?.balance ?? 0);
  const lowStockCount = Number(lowStockRow?.count ?? 0);
  const todaySales = Number(todaySalesRow?.total ?? 0);

  const statusTag: Record<string, string> = {
    dispatched: "mockup-tag-warn",
    delivered: "mockup-tag-good",
    returned: "mockup-tag-bad",
    pending: "mockup-tag-neutral",
    packed: "mockup-tag-neutral",
    in_transit: "mockup-tag-warn",
  };

  return (
    <AppShell
      active="dashboard"
      title="Dashboard"
      desc="Today's snapshot across sales, cash and deliveries"
      tenantName={user.tenantName}
      userInitial={user.name.charAt(0).toUpperCase()}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="mockup-card">
          <div className="mockup-kpi-label">Today&apos;s Sales</div>
          <div className="mockup-kpi-value">{fmtRs(todaySales)}</div>
        </div>
        <div className="mockup-card">
          <div className="mockup-kpi-label">Cash on Hand</div>
          <div className="mockup-kpi-value">{fmtRs(cashBalance)}</div>
        </div>
        <div className="mockup-card">
          <div className="mockup-kpi-label">Courier Receivable</div>
          <div className="mockup-kpi-value">{fmtRs(courierReceivable)}</div>
        </div>
        <div className="mockup-card">
          <div className="mockup-kpi-label">Low Stock Variants</div>
          <div className="mockup-kpi-value">{lowStockCount}</div>
        </div>
      </div>

      <div className="mockup-card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-[15px]" style={{ color: "var(--ink)" }}>
            Recent Orders
          </h3>
          <a href="/dashboard/sales" className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
            View all →
          </a>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase" style={{ color: "var(--muted)" }}>
              <th className="pb-2">Order</th>
              <th className="pb-2">Customer</th>
              <th className="pb-2">City</th>
              <th className="pb-2">Amount</th>
              <th className="pb-2">Payment</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((o, i) => (
              <tr key={o.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-2 font-mono text-xs">#{o.orderNumber}</td>
                <td className="py-2">{o.customerName}</td>
                <td className="py-2">{o.city}</td>
                <td className="py-2">{fmtRs(Number(orderTotals[i]?.total ?? 0))}</td>
                <td className="py-2">
                  <span className="mockup-tag mockup-tag-neutral">{o.paymentType.toUpperCase()}</span>
                </td>
                <td className="py-2">
                  <span className={"mockup-tag " + (statusTag[o.status] ?? "mockup-tag-neutral")}>{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mockup-card text-sm" style={{ color: "var(--muted)" }}>
        Logged in as <b style={{ color: "var(--ink)" }}>{user.name}</b> ({user.roleName}). Inventory and Sales &amp;
        Delivery are real and wired to this database — Accounts, Courier, and Admin screens are still being built out.
      </div>
    </AppShell>
  );
}
