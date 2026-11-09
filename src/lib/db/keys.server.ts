/** api_keys and api_audit_log. Server-only. */
import { maybeOne, one, q } from "./pool.server";

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type ApiKeyPublic = Omit<ApiKeyRow, "key_hash" | "user_id">;

export async function insertApiKey(row: {
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
}) {
  return one<Pick<ApiKeyRow, "id" | "name" | "scopes" | "key_prefix" | "created_at">>(
    `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, scopes, key_prefix, created_at`,
    [row.user_id, row.name, row.key_prefix, row.key_hash, row.scopes],
  );
}

export async function updateApiKeyScopes(userId: string, id: string, scopes: string[]) {
  await q(`UPDATE api_keys SET scopes = $3 WHERE user_id = $1 AND id = $2`, [userId, id, scopes]);
}

export async function listApiKeysByUser(userId: string) {
  return q<ApiKeyPublic>(
    `SELECT id, name, scopes, key_prefix, last_used_at, revoked_at, created_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
}

export async function revokeApiKey(userId: string, id: string) {
  await q(`UPDATE api_keys SET revoked_at = now() WHERE user_id = $1 AND id = $2`, [userId, id]);
}

export async function findApiKeyByHash(keyHash: string) {
  return maybeOne<Pick<ApiKeyRow, "id" | "user_id" | "scopes" | "revoked_at" | "key_prefix">>(
    `SELECT id, user_id, scopes, revoked_at, key_prefix FROM api_keys WHERE key_hash = $1`,
    [keyHash],
  );
}

export async function touchApiKey(id: string) {
  await q(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [id]);
}

export interface AuditRowInput {
  user_id: string;
  api_key_id?: string | null;
  key_prefix?: string | null;
  source: string;
  action: string;
  method?: string | null;
  path?: string | null;
  ad_account_id?: string | null;
  ok: boolean;
  status_code?: number | null;
  duration_ms?: number | null;
  detail: Record<string, unknown>;
  error?: string | null;
}

/** JSON as stored in jsonb columns; keeps server-function return types serialisable. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface AuditRow {
  id: string;
  user_id: string;
  api_key_id: string | null;
  key_prefix: string | null;
  source: string;
  action: string;
  method: string | null;
  path: string | null;
  ad_account_id: string | null;
  ok: boolean;
  status_code: number | null;
  duration_ms: number | null;
  detail: { [key: string]: Json };
  error: string | null;
  created_at: string;
}

export async function insertAudit(e: AuditRowInput) {
  await q(
    `INSERT INTO api_audit_log
       (user_id, api_key_id, key_prefix, source, action, method, path, ad_account_id, ok,
        status_code, duration_ms, detail, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      e.user_id,
      e.api_key_id ?? null,
      e.key_prefix ?? null,
      e.source,
      e.action,
      e.method ?? null,
      e.path ?? null,
      e.ad_account_id ?? null,
      e.ok,
      e.status_code ?? null,
      e.duration_ms ?? null,
      JSON.stringify(e.detail ?? {}),
      e.error ?? null,
    ],
  );
}

export async function listAudit(
  userId: string,
  opts: { limit?: number; action?: string; actions?: string[]; onlyFailures?: boolean } = {},
) {
  const where = ["user_id = $1"];
  const params: unknown[] = [userId];
  if (opts.action) {
    params.push(opts.action);
    where.push(`action = $${params.length}`);
  }
  if (opts.actions?.length) {
    params.push(opts.actions);
    where.push(`action = ANY($${params.length})`);
  }
  if (opts.onlyFailures) where.push("ok = false");
  params.push(opts.limit ?? 100);
  return q<AuditRow>(
    `SELECT * FROM api_audit_log WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
}
