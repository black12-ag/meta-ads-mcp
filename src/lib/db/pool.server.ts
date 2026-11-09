/**
 * PostgreSQL access for server code. Server-only module.
 * One pool per process. DATABASE_URL must be set (systemd env on the VPS, .env.local locally).
 *
 * Type parsers: bigint (int8) columns come back as JS numbers (all our bigints are cents or
 * counters far below 2^53), and timestamptz/timestamp columns come back as ISO strings, which
 * is what the rest of the code base expects (it was written against JSON from PostgREST).
 */
import { Pool, types, type QueryResultRow } from "pg";

const OID_INT8 = 20;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;

types.setTypeParser(OID_INT8, (v) => Number(v));
types.setTypeParser(OID_TIMESTAMPTZ, (v) => new Date(v).toISOString());
types.setTypeParser(OID_TIMESTAMP, (v) => new Date(v + "Z").toISOString());

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 8, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

/** Run a parameterised query and return every row. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

/** First row or null. */
export async function maybeOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** First row, or an error when the query matched nothing. */
export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T> {
  const row = await maybeOne<T>(text, params);
  if (!row) throw new Error("Expected one row");
  return row;
}

/** Build a multi-row VALUES list: values([[a,b],[c,d]]) -> "($1,$2),($3,$4)" plus params. */
export function values(rows: unknown[][]): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const text = rows
    .map(
      (r) =>
        `(${r
          .map((v) => {
            params.push(v);
            return `$${params.length}`;
          })
          .join(",")})`,
    )
    .join(",");
  return { text, params };
}

/** Run several statements atomically. */
export async function transaction<T>(fn: (run: typeof q) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const run = async <R extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) =>
    (await client.query<R>(text, params as never[])).rows;
  try {
    await client.query("BEGIN");
    const out = await fn(run as typeof q);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
