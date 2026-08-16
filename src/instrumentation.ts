/**
 * Next.js instrumentation hook — register() runs exactly once when the
 * server process starts (App Router, Next 15+, no config flag needed). This
 * is where the hourly Shopify auto-sync lives: EMS is a single long-running
 * Node process on Railway (not serverless), so a simple in-process interval
 * is the simplest correct approach — no separate cron service needed.
 *
 * Caveats worth knowing:
 * - Resets on every deploy/restart. Next run is ~1hr after whichever
 *   restart most recently happened, not pinned to the wall clock.
 * - If Railway ever scales this service to >1 replica, each replica would
 *   run its own timer, syncing the same tenants redundantly. Harmless
 *   (sync is idempotent) but wasteful — revisit with a real job queue if
 *   that happens.
 * - Runs for every tenant with a Shopify connection whose last status was
 *   "connected", not just this one store — this is written generically
 *   since integrationCredentials is already a multi-tenant table.
 */

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Next dev mode can call register() more than once across hot reloads —
  // guard with a global flag so we never stack up multiple intervals.
  const g = globalThis as unknown as { __emsShopifySchedulerStarted?: boolean };
  if (g.__emsShopifySchedulerStarted) return;
  g.__emsShopifySchedulerStarted = true;

  const { db } = await import("@/db");
  const { syncShopifyInventory } = await import("@/lib/shopify-inventory-sync");
  const { syncShopifyOrders } = await import("@/lib/shopify-orders-sync");

  let running = false;

  async function runHourlySync() {
    if (running) {
      console.log("[shopify-scheduler] previous run still in progress, skipping this tick");
      return;
    }
    running = true;
    try {
      const tenants = await db
        .selectFrom("integrationCredentials")
        .select(["tenantId"])
        .where("provider", "=", "shopify")
        .where("status", "=", "connected")
        .execute();

      console.log(`[shopify-scheduler] starting hourly sync for ${tenants.length} tenant(s)`);

      for (const { tenantId } of tenants) {
        try {
          const inv = await syncShopifyInventory(tenantId);
          console.log(
            `[shopify-scheduler] tenant ${tenantId} inventory: ${inv.ok ? "ok" : `failed — ${inv.error}`} ` +
              `(${inv.productsCreated} created, ${inv.productsUpdated} updated, ${inv.variantsCreated} new variants, ${inv.duplicateVariants.length} duplicate groups)`
          );
        } catch (e) {
          console.error(`[shopify-scheduler] tenant ${tenantId} inventory sync threw:`, e instanceof Error ? e.stack : e);
        }

        try {
          const sales = await syncShopifyOrders(tenantId);
          console.log(
            `[shopify-scheduler] tenant ${tenantId} sales: ${sales.ok ? "ok" : `failed — ${sales.error}`} ` +
              `(${sales.ordersCreated} created, ${sales.ordersUpdated} updated, ${sales.ordersSkipped} skipped, ${sales.unmatchedItems.length} unmatched items)`
          );
        } catch (e) {
          console.error(`[shopify-scheduler] tenant ${tenantId} sales sync threw:`, e instanceof Error ? e.stack : e);
        }
      }

      console.log("[shopify-scheduler] hourly sync complete");
    } catch (e) {
      console.error("[shopify-scheduler] run failed:", e instanceof Error ? e.stack : e);
    } finally {
      running = false;
    }
  }

  console.log(`[shopify-scheduler] started — syncing every ${SYNC_INTERVAL_MS / 60000} minutes`);
  setInterval(runHourlySync, SYNC_INTERVAL_MS);
  // Also run once shortly after startup, rather than waiting a full hour
  // for the first sync after every deploy.
  setTimeout(runHourlySync, 30_000);
}
