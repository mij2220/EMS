import { Kysely, PostgresDialect, CamelCasePlugin } from "kysely";
import { Pool } from "pg";
import type { DB } from "./types";

// Single shared connection pool for the whole app.
// DATABASE_URL comes from .env locally, and from Railway's Postgres plugin in production.
const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
});

// schema.sql uses snake_case columns; CamelCasePlugin lets the whole app write
// and read camelCase (businessName) while it talks snake_case (business_name)
// to Postgres underneath — matches how kysely-codegen generated src/db/types.ts.
export const db = new Kysely<DB>({ dialect, plugins: [new CamelCasePlugin()] });
