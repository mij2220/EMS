import { db } from "@/db";

export type SyncType = "inventory" | "sales";
export type Trigger = "scheduler" | "manual";

const RETENTION_DAYS = 2;

/**
 * Records a completed sync operation. Inserted once the operation finishes
 * (not created-then-updated) — startedAt is captured by the caller before
 * running the sync, everything else is known by the time this is called.
 */
export async function logSyncRun(params: {
  tenantId: string;
  provider: string;
  syncType: SyncType;
  trigger: Trigger;
  startedAt: Date;
  ok: boolean;
  summary?: unknown;
  error?: string;
}): Promise<void> {
  await db
    .insertInto("syncLogs")
    .values({
      tenantId: params.tenantId,
      provider: params.provider,
      syncType: params.syncType,
      trigger: params.trigger,
      startedAt: params.startedAt,
      finishedAt: new Date(),
      ok: params.ok,
      summary: params.summary != null ? JSON.stringify(params.summary) : null,
      error: params.error ?? null,
    })
    .execute();
}

/**
 * Deletes log rows older than the retention window. Called at the end of
 * each scheduler tick rather than as a separate cron — simplest way to keep
 * this self-maintaining without another moving part.
 */
export async function cleanupOldSyncLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db.deleteFrom("syncLogs").where("createdAt", "<", cutoff).executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}
