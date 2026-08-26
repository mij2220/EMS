/**
 * Seed script — loads real Aimexa Store data into a freshly-migrated database:
 * the same products, the 5 real M&P orders, couriers, accounts, and example
 * vouchers already validated in the UI/UX mockup and its automated test suite.
 *
 * Run with: npm run seed
 */
import { db } from "../src/db";
import { hashPassword } from "../src/lib/auth";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MOCKUP_PRODUCTS_RAW = require("./mockup-products-data.js");

const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || "ChangeMe123!";

async function main() {
  console.log("Seeding EMS with real Aimexa Store data...");

  // ---------- Tenant ----------
  const tenant = await db
    .insertInto("tenants")
    .values({ businessName: "Aimexa Store", currency: "PKR", timezone: "Asia/Karachi" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  const tenantId = tenant.id;

  // ---------- Expense Categories/Sub-categories (the previously-hardcoded list, now real rows) ----------
  const categoryNames = ["Utility Bill", "Shipping / Courier Fee", "Packaging", "Rent", "Marketing", "Miscellaneous"];
  const categoryIds: Record<string, string> = {};
  for (const name of categoryNames) {
    const cat = await db.insertInto("expenseCategories").values({ tenantId, name }).returning(["id"]).executeTakeFirstOrThrow();
    categoryIds[name] = cat.id;
  }
  for (const name of ["Meta Ads", "Google Ads", "TikTok Ads"]) {
    await db.insertInto("expenseSubcategories").values({ tenantId, categoryId: categoryIds["Marketing"], name }).execute();
  }

  // ---------- Role + Permissions (Owner/Admin — full access to every module) ----------
  const role = await db
    .insertInto("roles")
    .values({ tenantId, name: "Owner / Admin" })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  const modules = ["inventory", "sales", "accounts", "courier", "customers", "reporting", "admin"];
  await db
    .insertInto("permissions")
    .values(
      modules.map((module) => ({
        roleId: role.id,
        module,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
      }))
    )
    .execute();

  // ---------- Owner user ----------
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  await db
    .insertInto("users")
    .values({
      tenantId,
      roleId: role.id,
      name: "Owner",
      email: "owner@aimexa.store",
      passwordHash,
      status: "active",
      twoFaEnabled: false,
    })
    .execute();

  // ---------- Location ----------
  const location = await db
    .insertInto("locations")
    .values({ tenantId, name: "Aimexa Store", isDefault: true })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  // ---------- Products & variants (the FULL real catalog — all 37 products, 133
  // variants, exactly as validated in the finalized mockup, not a cut-down subset) ----------
  const MOCKUP_PRODUCTS: Record<
    string,
    {
      title: string;
      opt1Name: string;
      opt2Name: string;
      coo: string | null;
      variants: { o1: string; o2: string; oh: number; sku: string; hsCode: string; location: string; bin: string }[];
      price: number | null;
      cost: number | null;
      isDraft: boolean;
      isOOS: boolean;
      img: string | null;
    }
  > = MOCKUP_PRODUCTS_RAW;

  async function addProduct(handle: string, data: (typeof MOCKUP_PRODUCTS)[string]) {
    const product = await db
      .insertInto("products")
      .values({
        tenantId,
        handle,
        title: data.title,
        option1Name: data.opt1Name,
        option2Name: data.opt2Name,
        countryOfOrigin: data.coo,
        imageUrl: data.img,
        channel: "manual",
        status: data.isDraft ? "draft" : "active",
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const variantRows = await db
      .insertInto("variants")
      .values(
        data.variants.map((v) => ({
          productId: product.id,
          option1Value: v.o1,
          option2Value: v.o2,
          sku: v.sku || null,
          hsCode: v.hsCode || null,
          binName: v.bin || null,
          locationId: location.id,
          costPrice: data.cost != null ? data.cost.toString() : null,
          salePrice: data.price != null ? data.price.toString() : null,
          onHand: v.oh,
          reorderLevel: 30,
        }))
      )
      .returning(["id", "option1Value", "option2Value"])
      .execute();

    return { productId: product.id, variants: variantRows };
  }

  const productsByHandle: Record<string, Awaited<ReturnType<typeof addProduct>>> = {};
  for (const handle of Object.keys(MOCKUP_PRODUCTS)) {
    productsByHandle[handle] = await addProduct(handle, MOCKUP_PRODUCTS[handle]);
  }
  console.log(`  Seeded ${Object.keys(productsByHandle).length} products / ${Object.values(productsByHandle).reduce((s, p) => s + p.variants.length, 0)} variants`);

  // The 5 real orders below reference these specific products by their real handles —
  // matching exactly what's in productsByHandle, sourced from the same mockup data.
  const boxerShorts = productsByHandle["men-s-boxer-shorts"];
  const hotPinkVest = productsByHandle["pink-ladies-vest-1"];
  const yellowVest = productsByHandle["yellow-ladies-vest"];
  const lightBrownVest = productsByHandle["ladies-vest"];
  const whiteBrief = productsByHandle["white-mens-brief-1"];

  function findVariant(p: typeof boxerShorts, o1: string, o2: string) {
    const v = p.variants.find((v) => v.option1Value === o1 && v.option2Value === o2);
    if (!v) throw new Error(`Variant not found: ${o1}/${o2}`);
    return v;
  }

  // ---------- Vendors ----------
  const lyallpur = await db
    .insertInto("vendors")
    .values({ tenantId, name: "Lyallpur Textiles", contact: "041-111-222-333" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  await db.insertInto("vendors").values({ tenantId, name: "Faisalabad Cotton Mills", contact: "041-111-444-555" }).execute();

  // ---------- Customers (the 5 real customers from the mockup) ----------
  async function addCustomer(name: string, phone: string, city: string) {
    return db.insertInto("customers").values({ tenantId, name, phone, city }).returning(["id"]).executeTakeFirstOrThrow();
  }
  const arif = await addCustomer("Arif Aziz", "03032077468", "Islamabad");
  const azam = await addCustomer("Azam Ashiq", "+923062204455", "Lahore");
  const awab = await addCustomer("Syed Awab Ali", "03032323015", "Karachi");
  const sahib = await addCustomer("Sahib ur Rehman Khan", "03339176658", "Peshawar");
  const alefiyah = await addCustomer("Alefiyah Haider", "+923363499516", "Karachi");

  // ---------- Accounts (flat list — practical ledger, per SRD 5.5) ----------
  async function addAccount(name: string, type: string) {
    return db.insertInto("accounts").values({ tenantId, name, type }).returning(["id"]).executeTakeFirstOrThrow();
  }
  const cashAccount = await addAccount("Cash", "cash");
  await addAccount("Bank", "bank");
  const vendorLyallpurAccount = await addAccount("Vendor — Lyallpur Textiles", "payable");
  const salesAccount = await addAccount("Sales", "sales");
  const inventoryAccount = await addAccount("Inventory", "inventory");
  const expensePackagingAccount = await addAccount("Expense — Packaging", "expense");
  const salaryExpenseAccount = await addAccount("Salary Expense", "expense");

  // ---------- Employees ----------
  await db
    .insertInto("employees")
    .values([
      { tenantId, name: "Sana Iqbal", role: "Accountant" },
      { tenantId, name: "Bilal Ahmed", role: "Warehouse" },
      { tenantId, name: "Hina Farooq", role: "Viewer" },
      { tenantId, name: "Zeeshan Tariq", role: "Warehouse" },
    ])
    .execute();

  // ---------- Couriers ----------
  const mnp = await db
    .insertInto("couriers")
    .values({ tenantId, name: "M&P", mode: "api_and_manual", remittanceCycleDays: 7, commissionPercent: "8", commissionFlat: "20", contact: "021-111-627-627" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  await db.insertInto("couriers").values({ tenantId, name: "Leopards", mode: "manual", remittanceCycleDays: 14 }).execute();
  const courierReceivableMnpAccount = await addAccount("Courier Receivable — M&P", "receivable");

  // ---------- Orders (the 5 real orders from the M&P PDF) ----------
  async function addOrder(opts: {
    orderNumber: string;
    customerId: string;
    trackingNumber: string;
    status: string;
    remarks: string;
    items: { variantId: string; qty: number; unitPrice: number; unitCost: number }[];
  }) {
    const order = await db
      .insertInto("orders")
      .values({
        tenantId,
        orderNumber: opts.orderNumber,
        customerId: opts.customerId,
        courierId: mnp.id,
        trackingNumber: opts.trackingNumber,
        paymentType: "cod",
        source: "manual_pdf",
        status: opts.status,
        remarks: opts.remarks,
        inventoryDeducted: opts.status === "delivered",
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await db
      .insertInto("orderItems")
      .values(
        opts.items.map((it) => ({
          orderId: order.id,
          variantId: it.variantId,
          qty: it.qty,
          unitPrice: it.unitPrice.toString(),
          unitCost: it.unitCost.toString(),
        }))
      )
      .execute();

    const total = opts.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
    return { orderId: order.id, total };
  }

  const v1051027Variant = findVariant(boxerShorts, "XL", "White");
  const order1051027 = await addOrder({
    orderNumber: "1051027",
    customerId: arif.id,
    trackingNumber: "557793410000040",
    status: "dispatched",
    remarks: "Deliver after 5pm",
    items: [{ variantId: v1051027Variant.id, qty: 3, unitPrice: 695.43, unitCost: 278.17 }],
  });

  const order1051028 = await addOrder({
    orderNumber: "1051028",
    customerId: azam.id,
    trackingNumber: "557793410000039",
    status: "delivered",
    remarks: "Please take care of parcel",
    items: [
      { variantId: findVariant(hotPinkVest, "Free Size", "Hot pink").id, qty: 1, unitPrice: 698.0, unitCost: 279.2 },
      { variantId: findVariant(yellowVest, "Lemon Yellow", "One size").id, qty: 1, unitPrice: 482.57, unitCost: 193.03 },
      { variantId: findVariant(lightBrownVest, "light brown", "Free Size").id, qty: 1, unitPrice: 515.43, unitCost: 206.17 },
    ],
  });

  const order1051029 = await addOrder({
    orderNumber: "1051029",
    customerId: awab.id,
    trackingNumber: "557793410000038",
    status: "delivered",
    remarks: "Please take care of parcel",
    items: [{ variantId: findVariant(hotPinkVest, "Free Size", "Hot pink").id, qty: 1, unitPrice: 698.0, unitCost: 279.2 }],
  });

  const order1051030 = await addOrder({
    orderNumber: "1051030",
    customerId: sahib.id,
    trackingNumber: "557793410000037",
    status: "returned",
    remarks: "Please take care of parcel",
    items: [
      { variantId: findVariant(whiteBrief, "White", "XL").id, qty: 3, unitPrice: 653.67, unitCost: 261.47 },
      { variantId: v1051027Variant.id, qty: 3, unitPrice: 695.43, unitCost: 278.17 },
    ],
  });

  const order1051031 = await addOrder({
    orderNumber: "1051031",
    customerId: alefiyah.id,
    trackingNumber: "557793410000036",
    status: "dispatched",
    remarks: "Please take care of parcel",
    items: [{ variantId: findVariant(lightBrownVest, "light brown", "Free Size").id, qty: 3, unitPrice: 515.43, unitCost: 206.17 }],
  });

  // ---------- Vouchers + courier ledger entries (matching the mockup's 5 example vouchers) ----------
  async function addVoucher(opts: {
    number: string;
    type: string;
    date: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    reference: string;
  }) {
    const owner = await db.selectFrom("users").select("id").where("tenantId", "=", tenantId).executeTakeFirstOrThrow();
    return db
      .insertInto("vouchers")
      .values({
        tenantId,
        voucherNumber: opts.number,
        voucherType: opts.type,
        voucherDate: opts.date,
        debitAccountId: opts.debitAccountId,
        creditAccountId: opts.creditAccountId,
        amount: opts.amount.toString(),
        reference: opts.reference,
        enteredBy: owner.id,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
  }

  // Dispatch credits: each non-returned order credits the courier receivable account
  let runningBalance = 0;
  for (const [order, amount] of [
    [order1051027, order1051027.total],
    [order1051028, order1051028.total],
    [order1051029, order1051029.total],
    [order1051031, order1051031.total],
  ] as const) {
    runningBalance += amount;
    const voucher = await addVoucher({
      number: `VCH-DISPATCH-${order.orderId.slice(0, 8)}`,
      type: "journal",
      date: "2026-07-09",
      debitAccountId: courierReceivableMnpAccount.id,
      creditAccountId: salesAccount.id,
      amount,
      reference: `Order dispatched to M&P`,
    });
    await db
      .insertInto("courierLedgerEntries")
      .values({
        tenantId,
        courierId: mnp.id,
        orderId: order.orderId,
        entryType: "dispatch_credit",
        amount: amount.toString(),
        balanceAfter: runningBalance.toString(),
        voucherId: voucher.id,
      })
      .execute();
  }

  // Remittance batch #44 — realistically sized to the two orders that actually
  // reached Delivered (#1051028 Rs 1,696 + #1051029 Rs 698 = Rs 2,394). The mockup's
  // "Rs 68,250" figure assumed a ~32-order batch from a much larger illustrative
  // business; using that number here against only 5 real seeded orders would let
  // the courier remit more cash than was ever actually dispatched, which is a
  // real business logic problem (a courier can't hand back cash for orders that
  // aren't dispatched yet), not just an aesthetic mismatch. Adjust once real order
  // volume exists.
  const REMITTANCE_AMOUNT = order1051028.total + order1051029.total;
  const remittanceVoucher = await addVoucher({
    number: "VCH-0044",
    type: "cash_receipt",
    date: "2026-07-25",
    debitAccountId: cashAccount.id,
    creditAccountId: courierReceivableMnpAccount.id,
    amount: REMITTANCE_AMOUNT,
    reference: "M&P remittance batch #44 (orders #1051028, #1051029)",
  });
  runningBalance -= REMITTANCE_AMOUNT;
  await db
    .insertInto("courierLedgerEntries")
    .values({
      tenantId,
      courierId: mnp.id,
      entryType: "remittance_debit",
      amount: REMITTANCE_AMOUNT.toString(),
      balanceAfter: runningBalance.toString(),
      voucherId: remittanceVoucher.id,
    })
    .execute();

  const remittanceBatch = await db
    .insertInto("courierRemittanceBatches")
    .values({ tenantId, courierId: mnp.id, batchNumber: "44", amount: REMITTANCE_AMOUNT.toString(), voucherId: remittanceVoucher.id, status: "posted" })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  await db
    .insertInto("courierRemittanceOrders")
    .values([
      { remittanceBatchId: remittanceBatch.id, orderId: order1051028.orderId, slipAmount: order1051028.total.toString(), remittedAmount: order1051028.total.toString() },
      { remittanceBatchId: remittanceBatch.id, orderId: order1051029.orderId, slipAmount: order1051029.total.toString(), remittedAmount: order1051029.total.toString() },
    ])
    .execute();

  // Expense, Vendor Purchase, Salary, Cash Sale — matching the mockup's other 4 example vouchers
  await addVoucher({
    number: "VCH-0045",
    type: "expense",
    date: "2026-07-24",
    debitAccountId: expensePackagingAccount.id,
    creditAccountId: cashAccount.id,
    amount: 6400,
    reference: "Packaging materials",
  });

  await addVoucher({
    number: "VCH-0046",
    type: "vendor_purchase",
    date: "2026-07-24",
    debitAccountId: inventoryAccount.id,
    creditAccountId: vendorLyallpurAccount.id,
    amount: 32000,
    reference: "Fabric — Lyallpur Textiles",
  });

  await addVoucher({
    number: "VCH-0047",
    type: "salary",
    date: "2026-07-23",
    debitAccountId: salaryExpenseAccount.id,
    creditAccountId: cashAccount.id,
    amount: 28000,
    reference: "Warehouse staff — July",
  });

  await addVoucher({
    number: "VCH-0048",
    type: "cash_receipt",
    date: "2026-07-22",
    debitAccountId: cashAccount.id,
    creditAccountId: salesAccount.id,
    amount: 1696,
    reference: "Order #1051028 (Cash sale)",
  });

  console.log("Seed complete.");
  console.log(`  Tenant: Aimexa Store (${tenantId})`);
  console.log(`  Login:  owner@aimexa.store / ${OWNER_PASSWORD}`);
  console.log("  5 real orders, 5 products (12 variants), 2 vendors, 5 customers, 2 couriers, 9 vouchers seeded.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.destroy());
