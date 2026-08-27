import { db } from "@/db";
import { sql } from "kysely";

const MAX_BACKUPS = 2;

// These two tables are deliberately excluded from the dump: db_backups
// would back up its own previous contents recursively (exponential growth
// as backups accumulate), and schema_migrations tracks which migrations
// have run — restoring an old snapshot of it could make the app think a
// migration that's since been applied still needs to run again.
const EXCLUDED_TABLES = new Set(["db_backups", "schema_migrations"]);

type DumpedRow = Record<string, unknown>;
type DumpFile = { format: "ems-json-v1"; createdAt: string; tables: Record<string, DumpedRow[]> };

async function listBackupableTables(): Promise<string[]> {
  const rows = await sql<{ tableName: string }>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `.execute(db);
  return rows.rows.map((r) => r.tableName).filter((name) => !EXCLUDED_TABLES.has(name));
}

// Computes a safe insert order for a set of tables by reading their actual
// foreign-key relationships from information_schema and topologically
// sorting (parents before children) — e.g. accounts before vouchers, since
// vouchers.debit_account_id references accounts. TRUNCATE doesn't need this
// (CASCADE resolves FK order internally), but INSERT does: inserting a
// child row before its parent row exists violates the FK constraint. This
// was caught by testing the full restore cycle before ever handing this
// feature back to production — not something to assume works.
async function computeInsertOrder(tables: string[]): Promise<string[]> {
  const tableSet = new Set(tables);
  const deps = await sql<{ childTable: string; parentTable: string }>`
    select tc.table_name as child_table, ccu.table_name as parent_table
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  `.execute(db);

  const dependsOn = new Map<string, Set<string>>();
  for (const t of tables) dependsOn.set(t, new Set());
  for (const row of deps.rows) {
    if (row.childTable === row.parentTable) continue; // self-referencing FK, ignore for ordering
    if (!tableSet.has(row.childTable) || !tableSet.has(row.parentTable)) continue;
    dependsOn.get(row.childTable)!.add(row.parentTable);
  }

  const ordered: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((t) => [...dependsOn.get(t)!].every((dep) => ordered.includes(dep)));
    if (ready.length === 0) {
      // Shouldn't happen for a genuine DAG, but never hang forever — insert
      // whatever's left in any order rather than looping infinitely.
      ordered.push(...remaining);
      break;
    }
    for (const t of ready.sort()) {
      ordered.push(t);
      remaining.delete(t);
    }
  }
  return ordered;
}

// bytea columns (photo_data, credentials_encrypted, ...) come back from `pg`
// as real Node Buffers. JSON has no native binary type, so each Buffer is
// replaced with a tagged {__buf: base64} marker on the way out, and
// restored to a real Buffer on the way back in — this is what makes the
// dump/restore cycle byte-for-byte exact for binary columns, not just for
// plain text/number columns.
function serializeValue(v: unknown): unknown {
  if (Buffer.isBuffer(v)) return { __buf: v.toString("base64") };
  return v;
}
function deserializeValue(v: unknown): unknown {
  if (v && typeof v === "object" && "__buf" in (v as Record<string, unknown>)) {
    return Buffer.from((v as { __buf: string }).__buf, "base64");
  }
  return v;
}

/**
 * Builds a full logical backup of every real business table using plain
 * SQL SELECTs through the existing database connection — no external
 * pg_dump/psql binary required. This runs correctly regardless of whether
 * Postgres client tools happen to be installed in the app's own container,
 * which is exactly the gap that made the previous pg_dump-based version
 * fail with "spawn pg_dump ENOENT" (the app container isn't guaranteed to
 * have Postgres's own client tools installed — only the Postgres service
 * itself does).
 */
export async function runPgDump(): Promise<Buffer> {
  const tables = await listBackupableTables();
  const dump: DumpFile = { format: "ems-json-v1", createdAt: new Date().toISOString(), tables: {} };

  for (const table of tables) {
    const result = await sql<DumpedRow>`select * from ${sql.ref(table)}`.execute(db);
    dump.tables[table] = result.rows.map((row) => {
      const out: DumpedRow = {};
      for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v);
      return out;
    });
  }

  return Buffer.from(JSON.stringify(dump), "utf8");
}

/**
 * Restores a dump produced by runPgDump, in a single transaction — if
 * anything fails partway through, everything rolls back and the database
 * is left exactly as it was before the restore was attempted. Truncates
 * every dumped table in one statement (Postgres resolves the correct
 * foreign-key order internally when multiple tables are listed together),
 * then re-inserts every row with its original values, including primary
 * keys — this preserves the exact relationships between rows across
 * tables, not just each table's own contents in isolation.
 */
export async function runPsqlRestore(sqlContent: Buffer): Promise<void> {
  let dump: DumpFile;
  try {
    dump = JSON.parse(sqlContent.toString("utf8"));
  } catch {
    throw new Error("That file isn't a valid backup produced by this app — could not parse it as JSON.");
  }
  if (dump.format !== "ems-json-v1") {
    throw new Error(`Unrecognized backup format "${dump.format}" — this restore only understands backups created by this app's own Create Backup feature.`);
  }

  const tableNames = Object.keys(dump.tables);
  if (tableNames.length === 0) throw new Error("Backup contains no tables — refusing to restore an empty dump.");

  await db.transaction().execute(async (trx) => {
    // db_backups is deliberately excluded from the dump/restore cycle
    // itself, but it has a foreign key to users (created_by_user_id) — and
    // users IS one of the tables being truncated below. TRUNCATE ... CASCADE
    // automatically wipes ANY table with a FK into a truncated table, even
    // if that table wasn't explicitly named — so without this preservation
    // step, every restore would silently destroy all existing backup
    // records, including the safety snapshot just taken moments before this
    // same restore. Caught by testing the full cycle end-to-end, not
    // assumed safe.
    const preservedBackups = await trx.selectFrom("dbBackups").selectAll().execute();

    await sql`truncate table ${sql.join(tableNames.map((t) => sql.ref(t)))} cascade`.execute(trx);

    const insertOrder = await computeInsertOrder(tableNames);
    for (const table of insertOrder) {
      const rows = dump.tables[table];
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      for (const row of rows) {
        const values = columns.map((c) => deserializeValue(row[c]));
        const columnList = sql.join(columns.map((c) => sql.ref(c)));
        const valueList = sql.join(values.map((v) => sql`${v}`));
        await sql`insert into ${sql.ref(table)} (${columnList}) values (${valueList})`.execute(trx);
      }
    }

    // Restore backup history last, now that the restored users exist again
    // with their original ids. If a particular backup's creator genuinely
    // isn't present in this restored dataset (e.g. restoring a very old
    // backup from before that admin existed), fall back to a null creator
    // rather than losing the backup record entirely.
    for (const b of preservedBackups) {
      try {
        await trx.insertInto("dbBackups").values(b).execute();
      } catch {
        await trx.insertInto("dbBackups").values({ ...b, createdByUserId: null }).execute();
      }
    }
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
