/** meta_sync_runs, meta_sync_retries, meta_webhook_events. Server-only. */
import { maybeOne, q } from "./pool.server";

export interface SyncRunRow {
  id: string;
  user_id: string;
  ad_account_id: string | null;
  ads_synced: number;
  status: string;
  error_message: string | null;
  source: string;
  created_at: string;
}

export async function insertSyncRun(row: {
  user_id: string;
  ad_account_id: string | null;
  ads_synced: number;
  status: string;
  source: string;
  error_message?: string | null;
}) {
  await q(
    `INSERT INTO meta_sync_runs (user_id, ad_account_id, ads_synced, status, source, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.user_id, row.ad_account_id, row.ads_synced, row.status, row.source, row.error_message ?? null],
  );
}

export async function listSyncRuns(userId: string, limit = 10) {
  return q<SyncRunRow>(
    `SELECT * FROM meta_sync_runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function lastOkSyncAt(userId: string) {
  const row = await maybeOne<{ created_at: string }>(
    `SELECT created_at FROM meta_sync_runs WHERE user_id = $1 AND status = 'ok'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return row?.created_at ?? null;
}

export async function lastWebhookSyncAt(userId: string) {
  const row = await maybeOne<{ created_at: string }>(
    `SELECT created_at FROM meta_sync_runs WHERE user_id = $1 AND source = 'webhook'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return row?.created_at ?? null;
}

export async function deleteSyncRunsByUser(userId: string) {
  await q(`DELETE FROM meta_sync_runs WHERE user_id = $1`, [userId]);
}

// ---- retries ----

export interface RetryRow {
  id: string;
  user_id: string;
  ad_account_id: string | null;
  source: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  last_error_kind: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type RetryInput = Pick<
  RetryRow,
  "user_id" | "ad_account_id" | "source" | "attempts" | "next_attempt_at" | "last_error" | "last_error_kind" | "status"
>;

export async function findPendingRetry(userId: string) {
  return maybeOne<Pick<RetryRow, "id" | "attempts" | "max_attempts">>(
    `SELECT id, attempts, max_attempts FROM meta_sync_retries WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
}

export async function insertRetry(row: RetryInput) {
  await q(
    `INSERT INTO meta_sync_retries
       (user_id, ad_account_id, source, attempts, next_attempt_at, last_error, last_error_kind, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.user_id, row.ad_account_id, row.source, row.attempts, row.next_attempt_at, row.last_error, row.last_error_kind, row.status],
  );
}

export async function updateRetry(id: string, patch: Omit<RetryInput, "user_id">) {
  await q(
    `UPDATE meta_sync_retries SET ad_account_id = $2, source = $3, attempts = $4, next_attempt_at = $5,
       last_error = $6, last_error_kind = $7, status = $8 WHERE id = $1`,
    [id, patch.ad_account_id, patch.source, patch.attempts, patch.next_attempt_at, patch.last_error, patch.last_error_kind, patch.status],
  );
}

export async function recoverRetries(userId: string) {
  await q(
    `UPDATE meta_sync_retries SET status = 'recovered', next_attempt_at = now()
     WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
}

export async function listDueRetries(limit: number) {
  return q<Pick<RetryRow, "id" | "user_id" | "attempts">>(
    `SELECT id, user_id, attempts FROM meta_sync_retries
     WHERE status = 'pending' AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC LIMIT $1`,
    [limit],
  );
}

export async function listRetries(userId: string, limit = 5) {
  return q<RetryRow>(
    `SELECT * FROM meta_sync_retries WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function deleteRetriesByUser(userId: string) {
  await q(`DELETE FROM meta_sync_retries WHERE user_id = $1`, [userId]);
}

// ---- webhook events ----

export interface WebhookEventRow {
  id: string;
  user_id: string | null;
  meta_user_id: string | null;
  object: string | null;
  field: string | null;
  payload: unknown;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export async function insertWebhookEvent(row: {
  user_id?: string | null;
  object: string;
  field: string | null;
  payload: unknown;
  processed_at?: string | null;
  error_message?: string | null;
}) {
  await q(
    `INSERT INTO meta_webhook_events (user_id, object, field, payload, processed_at, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.user_id ?? null, row.object, row.field, JSON.stringify(row.payload ?? {}), row.processed_at ?? null, row.error_message ?? null],
  );
}

export async function listHandshakes(limit = 5) {
  return q<Pick<WebhookEventRow, "id" | "object" | "field" | "error_message" | "created_at">>(
    `SELECT id, object, field, error_message, created_at FROM meta_webhook_events
     WHERE object = 'handshake' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

export async function listWebhookEvents(userId: string, limit = 15) {
  return q<Pick<WebhookEventRow, "id" | "object" | "field" | "created_at" | "processed_at" | "error_message">>(
    `SELECT id, object, field, created_at, processed_at, error_message FROM meta_webhook_events
     WHERE user_id = $1 AND object <> 'handshake' ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function deleteWebhookEventsByUser(userId: string) {
  await q(`DELETE FROM meta_webhook_events WHERE user_id = $1`, [userId]);
}
