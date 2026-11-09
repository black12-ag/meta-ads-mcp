#!/usr/bin/env node
// Applies db/schema.sql to $DATABASE_URL inside one transaction. Safe to re-run.
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  const { rows } = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
  );
  console.log(`schema applied: ${rows[0].n} tables`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
