import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import {
  findApiKeyByHash,
  insertApiKey,
  insertAudit,
  listApiKeysByUser,
  listAudit,
  revokeApiKey,
  touchApiKey,
  updateApiKeyScopes,
} from "@/lib/db/keys.server";

beforeAll(resetDatabase);

test("api keys: insert, find by hash, scopes, revoke, list", async () => {
  const created = await insertApiKey({
    user_id: "u1",
    name: "laptop",
    key_prefix: "sk_meta_abc",
    key_hash: "hash1",
    scopes: ["ads:read"],
  });
  expect(created.name).toBe("laptop");
  expect(created.scopes).toEqual(["ads:read"]);

  const found = await findApiKeyByHash("hash1");
  expect(found?.user_id).toBe("u1");
  expect(found?.revoked_at).toBeNull();
  expect(await findApiKeyByHash("nope")).toBeNull();

  await updateApiKeyScopes("u1", created.id, ["ads:read", "ads:status"]);
  await touchApiKey(created.id);
  const listed = await listApiKeysByUser("u1");
  expect(listed).toHaveLength(1);
  expect(listed[0].scopes).toEqual(["ads:read", "ads:status"]);
  expect(listed[0].last_used_at).not.toBeNull();
  expect("key_hash" in listed[0]).toBe(false);

  await revokeApiKey("u1", created.id);
  expect((await findApiKeyByHash("hash1"))?.revoked_at).not.toBeNull();

  // another user cannot revoke or re-scope it
  await updateApiKeyScopes("u2", created.id, ["sync:write"]);
  expect((await listApiKeysByUser("u1"))[0].scopes).toEqual(["ads:read", "ads:status"]);
});

test("audit: insert and filter", async () => {
  const base = { user_id: "u1", source: "api", method: "GET", path: "/v1/ads", detail: { a: 1 } };
  await insertAudit({ ...base, action: "ads.list", ok: true, status_code: 200 });
  await insertAudit({ ...base, action: "ads.status", ok: false, status_code: 403, error: "nope" });
  await insertAudit({ ...base, action: "keys.create", ok: true, source: "dashboard" });
  await insertAudit({ ...base, user_id: "u2", action: "ads.list", ok: true });

  expect(await listAudit("u1")).toHaveLength(3);
  expect((await listAudit("u1", { onlyFailures: true })).map((r) => r.action)).toEqual(["ads.status"]);
  expect((await listAudit("u1", { action: "keys.create" }))[0].source).toBe("dashboard");
  expect((await listAudit("u1", { actions: ["ads.list", "ads.status"] })).map((r) => r.action).sort()).toEqual([
    "ads.list",
    "ads.status",
  ]);
  expect((await listAudit("u1", { limit: 1 }))).toHaveLength(1);
  expect((await listAudit("u1"))[0].detail).toEqual({ a: 1 });
});
