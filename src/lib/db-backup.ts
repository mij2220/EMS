import { spawn } from "child_process";
import { db } from "@/db";

const MAX_BACKUPS = 2;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set on the server.");
  return url;
}

/**
 * Runs pg_dump against the live database and returns the full SQL dump as
 * a Buffer. --clean --if-exists means the dump includes DROP-then-CREATE
 * statements for every object, so restoring it fully replaces existing
 * schema+data rather than erroring on conflicts with what's already there.
 * --no-owner --no-privileges avoids baking in Railway's specific DB role
 * names, which could differ if ever restored somewhere else.
 */
export async function runPgDump(): Promise<Buffer> {
  const dbUrl = getDatabaseUrl();
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--no-owner", "--no-privileges", "--clean", "--if-exists", dbUrl]);
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errChunks.push(c));
    child.on("error", (err) => reject(new Error(`Could not start pg_dump: ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 1000)}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Restores a SQL dump by piping it into psql. -1 / --single-transaction
 * wraps the ENTIRE script in one transaction — if anything in the dump
 * fails partway through, Postgres rolls back everything, so the database
 * is never left in a half-dropped, half-restored broken state. This is the
 * single most important safety property of this whole feature.
 */
export async function runPsqlRestore(sqlContent: Buffer): Promise<void> {
  const dbUrl = getDatabaseUrl();
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["--single-transaction", "--set", "ON_ERROR_STOP=1", dbUrl]);
    const errChunks: Buffer[] = [];
    child.stderr.on("data", (c) => errChunks.push(c));
    child.on("error", (err) => reject(new Error(`Could not start psql: ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Restore failed (rolled back, database unchanged): ${Buffer.concat(errChunks).toString("utf8").slice(0, 1000)}`));
        return;
      }
      resolve();
    });
    child.stdin.write(sqlContent);
    child.stdin.end();
  });
}

/** Creates a backup row from a dump, then trims old rows beyond MAX_BACKUPS. */
export async function createBackup(userId: string, isPreRestoreSnapshot = false): Promise<{ id: string; sizeBytes: number }> {
  const dump = await runPgDump();
  const row = await db
    .insertInto("dbBackups")
    .values({ createdByUserId: userId, sizeBytes: dump.length, isPreRestoreSnapshot, content: dump })
    .returning(["id", "sizeBytes"])
    .executeTakeFirstOrThrow();

  // Retention: keep only the most recent MAX_BACKUPS rows, regardless of
  // whether they're regular or pre-restore-safety backups — a safety
  // snapshot counts toward the same limit rather than accumulating
  // separately forever.
  const toDelete = await db
    .selectFrom("dbBackups")
    .select("id")
    .orderBy("createdAt", "desc")
    .offset(MAX_BACKUPS)
    .execute();
  if (toDelete.length > 0) {
    await db.deleteFrom("dbBackups").where("id", "in", toDelete.map((r) => r.id)).execute();
  }

  return { id: row.id, sizeBytes: Number(row.sizeBytes) };
}
