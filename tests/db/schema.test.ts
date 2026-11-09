import { beforeAll, expect, test } from "vitest";
import { resetDatabase, testPool } from "../setup/db";

beforeAll(resetDatabase);

test("schema creates every table the app reads", async () => {
  const { rows } = await testPool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public' order by 1",
  );
  const names = rows.map((r) => r.table_name);
  for (const t of [
    "profiles",
    "campaigns",
    "posts",
    "meta_connections",
    "meta_ad_accounts",
    "meta_pages",
    "saved_ads",
    "meta_oauth_states",
    "meta_sync_runs",
    "api_keys",
    "meta_ad_changes",
    "meta_webhook_events",
    "meta_sync_retries",
    "api_audit_log",
    "meta_app_settings",
    "oauth_clients",
    "oauth_codes",
    "oauth_tokens",
    "mcp_pending_actions",
  ]) {
    expect(names, t).toContain(t);
  }
});

test("schema is idempotent", async () => {
  await expect(resetDatabase()).resolves.toBeUndefined();
});

test("updated_at trigger fires", async () => {
  await testPool.query("insert into profiles (id) values ('u1')");
  const before = (await testPool.query("select updated_at from profiles where id='u1'")).rows[0]
    .updated_at;
  await new Promise((r) => setTimeout(r, 20));
  await testPool.query("update profiles set display_name='x' where id='u1'");
  const after = (await testPool.query("select updated_at from profiles where id='u1'")).rows[0]
    .updated_at;
  expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
});
