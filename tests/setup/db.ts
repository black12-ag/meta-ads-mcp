import { readFileSync } from "node:fs";
import { Pool } from "pg";

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Drop and recreate the whole schema so every test file starts clean. */
export async function resetDatabase() {
  await testPool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await testPool.query(readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8"));
}
