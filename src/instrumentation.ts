/**
 * Next.js instrumentation hook — register() runs exactly once when the
 * server process starts (App Router, Next 15+, no config flag needed). This
 * is where the Shopify auto-sync lives: EMS is a single long-running Node
 * process on Railway (not serverless), so a simple in-process interval is
 * the simplest correct approach — no separate cron service needed.
 *
 * Frequency is per-tenant and admin-configurable (integrationCredentials.
 * syncFrequencyMinutes, editable from Admin -> Integrations) — rather than a
 * fixed setInterval matching that exact value (which would need a server
 * restart to pick up a change), this ticks frequently (every 5 min) and
 * checks each tenant's own elapsed-time-since-last-run against their
 * configured frequency. Changing the setting in Admin takes effect on the
 * next tick, no restart needed.
 *
 * Every run (scheduled or manual) gets logged to sync_logs — see
 * src/lib/sync-logs.ts — visible at Admin -> Sync Logs, kept for 2 days
 * (retention enforced here, at the end of each tick).
 *
 * Caveats worth knowing:
 * - Resets on every deploy/restart, but since due-ness is based on the
 *   *last sync timestamp stored in the database* rather than an in-memory
 *   timer, a restart doesn't cause a missed or double sync — it just
 *   resumes checking.
 * - If Railway ever scales this service to >1 replica, each replica would
 *   tick independently and could both decide "it's time" for the same
 *   tenant simultaneously. Harmless (sync is idempotent) but wasteful —
 *   revisit with a real job queue/leader election if that happens.
 * - Runs for every tenant with a Shopify connection whose last status was
 *   "connected", not just one store — written generically since
 *   integrationCredentials is already a multi-tenant table.
 */

const TICK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const STARTUP_DELAY_MS = 30_000; // first check shortly after boot, not a full tick later

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
  const { logSyncRun, cleanupOldSyncLogs } = await import("@/lib/sync-logs");

  let running = false;

  async function runOneSync(tenantId: string, syncType: "inventory" | "sales") {
    const startedAt = new Date();
    try {
      const result = syncType === "inventory" ? await syncShopifyInventory(tenantId) : await syncShopifyOrders(tenantId);
      await logSyncRun({ tenantId, provider: "shopify", syncType, trigger: "scheduler", startedAt, ok: result.ok, summary: result, error: result.error });
      console.log(`[shopify-scheduler] tenant ${tenantId} ${syncType}: ${result.ok ? "ok" : `failed — ${result.error}`}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logSyncRun({ tenantId, provider: "shopify", syncType, trigger: "scheduler", startedAt, ok: false, error: message });
      console.error(`[shopify-scheduler] tenant ${tenantId} ${syncType} sync threw:`, e instanceof Error ? e.stack : e);
    }
  }

  async function tick() {
    if (running) {
      console.log("[shopify-scheduler] previous tick still in progress, skipping");
      return;
    }
    running = true;
    try {
      const tenants = await db
        .selectFrom("integrationCredentials")
        .select(["tenantId", "syncFrequencyMinutes", "lastSyncAt"])
        .where("provider", "=", "shopify")
        .where("status", "=", "connected")
        .execute();

      for (const t of tenants) {
        const frequencyMinutes = t.syncFrequencyMinutes ?? 60;
        const dueAt = t.lastSyncAt ? new Date(t.lastSyncAt).getTime() + frequencyMinutes * 60_000 : 0;
        if (Date.now() < dueAt) continue; // not due yet for this tenant

        console.log(`[shopify-scheduler] tenant ${t.tenantId} is due (every ${frequencyMinutes}min) — syncing`);
        await runOneSync(t.tenantId, "inventory");
        await runOneSync(t.tenantId, "sales");
      }

      const deleted = await cleanupOldSyncLogs();
      if (deleted > 0) console.log(`[shopify-scheduler] cleaned up ${deleted} sync-log row(s) older than 2 days`);
    } catch (e) {
      console.error("[shopify-scheduler] tick failed:", e instanceof Error ? e.stack : e);
    } finally {
      running = false;
    }
  }

  console.log(`[shopify-scheduler] started — checking every ${TICK_INTERVAL_MS / 60000}min, per-tenant frequency is admin-configurable`);
  setInterval(tick, TICK_INTERVAL_MS);
  setTimeout(tick, STARTUP_DELAY_MS);
}
