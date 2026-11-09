/**
 * Outgoing webhooks: the owner's endpoints and the event emitter. Server-only.
 * A signing secret leaves this module once, right after create.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { maybeOne, q, transaction } from "@/lib/db/pool.server";
import {
  deliver,
  validateWebhookUrl,
  type DeliveryResult,
  type WebhookPayload,
} from "./deliver.server";
import type { WebhookEvent } from "./events";

export const MAX_ENDPOINTS = 10;
const MAX_FAILURES = 20; // in a row; then the endpoint is paused

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  created_at: string;
  last_status: number | null;
  last_error: string | null;
  last_delivery_at: string | null;
  failure_count: number;
}

type Target = { id: string; url: string; secret: string };

const COLUMNS =
  "id, url, events, active, created_at, last_status, last_error, last_delivery_at, failure_count";

const payload = (
  type: WebhookPayload["type"],
  data: Record<string, unknown>,
  text: string,
): WebhookPayload => ({ id: randomUUID(), type, created_at: new Date().toISOString(), data, text });

export function listEndpoints(userId: string) {
  return q<WebhookEndpoint>(
    `SELECT ${COLUMNS} FROM webhook_endpoints WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
}

export async function createEndpoint(
  userId: string,
  url: string,
  events: WebhookEvent[],
): Promise<{ error: string } | { error: null; endpoint: WebhookEndpoint; secret: string }> {
  const problem = validateWebhookUrl(url);
  if (problem) return { error: problem };
  const secret = `whsec_${randomBytes(32).toString("hex")}`;
  const endpoint = await transaction(async (run) => {
    // Two quick creates must not both slip under the cap.
    await run("SELECT pg_advisory_xact_lock(hashtext($1))", [`webhooks:${userId}`]);
    const [row] = await run<WebhookEndpoint>(
      `INSERT INTO webhook_endpoints (user_id, url, secret, events)
       SELECT $1, $2, $3, $4::text[]
       WHERE (SELECT count(*) FROM webhook_endpoints WHERE user_id = $1) < $5
       RETURNING ${COLUMNS}`,
      [userId, url, secret, events, MAX_ENDPOINTS],
    );
    return row;
  });
  if (!endpoint)
    return { error: `You can have up to ${MAX_ENDPOINTS} webhooks. Delete one first.` };
  return { error: null, endpoint, secret };
}

/** Change the events, or pause / resume. Resuming starts the failure count again. */
export function updateEndpoint(
  userId: string,
  id: string,
  patch: { events?: WebhookEvent[]; active?: boolean },
) {
  return maybeOne<WebhookEndpoint>(
    `UPDATE webhook_endpoints
     SET events = COALESCE($3::text[], events),
         active = COALESCE($4::boolean, active),
         failure_count = CASE WHEN $4::boolean THEN 0 ELSE failure_count END
     WHERE user_id = $1 AND id = $2
     RETURNING ${COLUMNS}`,
    [userId, id, patch.events ?? null, patch.active ?? null],
  );
}

/** The deleted endpoint's URL, or null when there was nothing to delete. */
export function deleteEndpoint(userId: string, id: string) {
  return maybeOne<{ url: string }>(
    `DELETE FROM webhook_endpoints WHERE user_id = $1 AND id = $2 RETURNING url`,
    [userId, id],
  );
}

/** Saves how a delivery went, and pauses the endpoint after MAX_FAILURES failures in a row. */
function record(id: string, r: DeliveryResult) {
  return q(
    `UPDATE webhook_endpoints
     SET last_status = $2, last_error = $3, last_delivery_at = now(),
         failure_count = CASE WHEN $4::boolean THEN 0 ELSE failure_count + 1 END,
         active = active AND ($4::boolean OR failure_count + 1 < $5)
     WHERE id = $1`,
    [id, r.status, r.error, r.ok, MAX_FAILURES],
  );
}

/**
 * Sends an event to every active endpoint of the user that subscribed to it. Fire-and-forget:
 * returns at once and never throws, so a slow or broken webhook can't hold up or break the caller.
 */
export function emitEvent(
  userId: string,
  type: WebhookEvent,
  data: Record<string, unknown>,
  text: string,
): void {
  const event = payload(type, data, text);
  q<Target>(
    `SELECT id, url, secret FROM webhook_endpoints
     WHERE user_id = $1 AND active AND $2 = ANY(events)`,
    [userId, type],
  )
    .then((targets) => Promise.all(targets.map(async (t) => record(t.id, await deliver(t, event)))))
    .catch((err) =>
      console.error("[webhooks] emit failed:", err instanceof Error ? err.message : err),
    );
}

/** Sends a "ping" and waits, so the page can show how it went. Null for an unknown endpoint. */
export async function sendTest(userId: string, id: string): Promise<DeliveryResult | null> {
  const target = await maybeOne<Target>(
    `SELECT id, url, secret FROM webhook_endpoints WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  if (!target) return null;
  const result = await deliver(
    target,
    payload("ping", {}, "Test from Viral4All Ads: this webhook works."),
  );
  await record(target.id, result);
  return result;
}
