/**
 * Backoff queue for failed Meta syncs (webhook-triggered or scheduled).
 * Transient failures — rate limits, network blips, momentarily missing
 * permissions — are retried with exponential backoff instead of being lost.
 */
import {
  findPendingRetry,
  insertRetry,
  listDueRetries,
  listRetries,
  recoverRetries,
  updateRetry,
} from "@/lib/db/sync.server";
import type { SyncOutcome } from "./sync.server";

/** Token failures need a human to reconnect, so they never go in the queue. */
const RETRYABLE = new Set(["rate_limit", "network", "permission", "unknown"]);

const BASE_DELAY_SECONDS = 60;
const MAX_DELAY_SECONDS = 3600;

export function backoffSeconds(attempts: number) {
  return Math.min(BASE_DELAY_SECONDS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_SECONDS);
}

export function isRetryable(kind: string | undefined) {
  return RETRYABLE.has(kind ?? "unknown");
}

/** Record (or escalate) a retry after a failed sync. */
export async function scheduleRetry(outcome: SyncOutcome, source: string) {
  if (outcome.status !== "error" || !isRetryable(outcome.errorKind)) return null;

  const existing = await findPendingRetry(outcome.userId);
  const attempts = (existing?.attempts ?? 0) + 1;
  const maxAttempts = existing?.max_attempts ?? 6;
  const exhausted = attempts >= maxAttempts;
  const nextAttemptAt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();

  const patch = {
    ad_account_id: outcome.accountId,
    source,
    attempts,
    next_attempt_at: nextAttemptAt,
    last_error: (outcome.error ?? "Sync failed").slice(0, 500),
    last_error_kind: outcome.errorKind ?? "unknown",
    status: exhausted ? "exhausted" : "pending",
  };

  if (existing) await updateRetry(existing.id, patch);
  else await insertRetry({ user_id: outcome.userId, ...patch });
  return { attempts, nextAttemptAt, exhausted };
}

/** A sync succeeded — close out any pending retry for that user. */
export async function clearRetry(userId: string) {
  await recoverRetries(userId);
}

/** Run every retry that is due for one user (dashboard button) or for everyone (cron). */
export async function drainRetryQueue(limit = 25, onlyUserId?: string) {
  const { syncUser } = await import("./sync.server");
  const due = (await listDueRetries(limit)).filter((r) => !onlyUserId || r.user_id === onlyUserId);

  let recovered = 0;
  let stillFailing = 0;
  for (const row of due) {
    // syncUser re-schedules or clears the entry through scheduleRetry / clearRetry.
    const outcome = await syncUser(row.user_id, "retry");
    if (outcome.status === "error") stillFailing += 1;
    else recovered += 1;
  }
  return { due: due.length, recovered, stillFailing };
}

/** Everything the UI needs to show the queue state for one user. */
export async function retryStatus(userId: string) {
  return listRetries(userId, 5);
}
