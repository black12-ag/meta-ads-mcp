import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import {
  deleteRetriesByUser,
  deleteSyncRunsByUser,
  deleteWebhookEventsByUser,
  findPendingRetry,
  insertRetry,
  insertSyncRun,
  insertWebhookEvent,
  lastOkSyncAt,
  lastWebhookSyncAt,
  listDueRetries,
  listHandshakes,
  listRetries,
  listSyncRuns,
  listWebhookEvents,
  recoverRetries,
  updateRetry,
} from "@/lib/db/sync.server";

beforeAll(resetDatabase);

test("sync runs: list, last ok, last webhook", async () => {
  await insertSyncRun({ user_id: "u1", ad_account_id: "111", ads_synced: 3, status: "ok", source: "manual" });
  await insertSyncRun({ user_id: "u1", ad_account_id: "111", ads_synced: 0, status: "error", source: "webhook", error_message: "boom" });
  const runs = await listSyncRuns("u1");
  expect(runs).toHaveLength(2);
  expect(runs[0].status).toBe("error");
  expect(await lastOkSyncAt("u1")).toBe(runs[1].created_at);
  expect(await lastWebhookSyncAt("u1")).toBe(runs[0].created_at);
  expect(await lastOkSyncAt("u2")).toBeNull();
});

test("retries: pending uniqueness, due listing, recovery", async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  await insertRetry({ user_id: "u1", ad_account_id: "111", source: "webhook", attempts: 1, next_attempt_at: future, last_error: "x", last_error_kind: "network", status: "pending" });
  await insertRetry({ user_id: "u2", ad_account_id: null, source: "cron", attempts: 2, next_attempt_at: past, last_error: "y", last_error_kind: "rate_limit", status: "pending" });

  expect((await listDueRetries(10)).map((r) => r.user_id)).toEqual(["u2"]);

  const pending = await findPendingRetry("u1");
  expect(pending?.attempts).toBe(1);
  await updateRetry(pending!.id, { ad_account_id: "111", source: "webhook", attempts: 2, next_attempt_at: past, last_error: "x2", last_error_kind: "network", status: "pending" });
  expect((await listDueRetries(10)).map((r) => r.user_id).sort()).toEqual(["u1", "u2"]);

  await recoverRetries("u1");
  expect(await findPendingRetry("u1")).toBeNull();
  expect((await listRetries("u1"))[0].status).toBe("recovered");

  // a second pending row for the same user is rejected by the partial unique index
  await insertRetry({ user_id: "u1", ad_account_id: null, source: "cron", attempts: 1, next_attempt_at: future, last_error: null, last_error_kind: null, status: "pending" });
  await expect(
    insertRetry({ user_id: "u1", ad_account_id: null, source: "cron", attempts: 1, next_attempt_at: future, last_error: null, last_error_kind: null, status: "pending" }),
  ).rejects.toThrow();
});

test("webhook events: handshakes are global, deliveries per user", async () => {
  await insertWebhookEvent({ object: "handshake", field: "verified", payload: {} });
  await insertWebhookEvent({ object: "handshake", field: "rejected", payload: {}, error_message: "bad token" });
  await insertWebhookEvent({ user_id: "u1", object: "ad_account", field: "in_process_ad_objects", payload: { id: "1" }, processed_at: new Date().toISOString() });

  const hs = await listHandshakes();
  expect(hs).toHaveLength(2);
  expect(hs[0].field).toBe("rejected");
  const ev = await listWebhookEvents("u1");
  expect(ev).toHaveLength(1);
  expect(ev[0].object).toBe("ad_account");
});

test("purge helpers", async () => {
  await deleteSyncRunsByUser("u1");
  await deleteRetriesByUser("u1");
  await deleteWebhookEventsByUser("u1");
  expect(await listSyncRuns("u1")).toEqual([]);
  expect(await listRetries("u1")).toEqual([]);
  expect(await listWebhookEvents("u1")).toEqual([]);
});
