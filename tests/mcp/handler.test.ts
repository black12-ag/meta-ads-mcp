import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import { hashKey } from "@/lib/api-keys.server";
import { insertApiKey } from "@/lib/db/keys.server";
import { insertCampaign } from "@/lib/db/workspace.server";
import { handleMcpRequest } from "@/lib/mcp/handler.server";
import { NOTES_TOOLS } from "@/lib/mcp/server";

const KEY = "sk_meta_test_key_for_mcp";

beforeAll(async () => {
  await resetDatabase();
  await insertApiKey({
    user_id: "mcp-user",
    name: "test",
    key_prefix: KEY.slice(0, 16),
    key_hash: await hashKey(KEY),
    scopes: ["ads:read"],
  });
  await insertApiKey({
    user_id: "mcp-user",
    name: "full",
    key_prefix: FULL_KEY.slice(0, 16),
    key_hash: await hashKey(FULL_KEY),
    scopes: [
      "ads:read",
      "ads:create",
      "ads:status",
      "ads:creative",
      "ads:budget",
      "ads:edit",
      "media:write",
      "sync:write",
    ],
  });
  await insertCampaign({
    user_id: "mcp-user",
    name: "Launch",
    platform: "meta",
    objective: "traffic",
    budget_cents: 100,
  });
  await insertCampaign({
    user_id: "other",
    name: "Hidden",
    platform: "meta",
    objective: "traffic",
    budget_cents: 100,
  });
});

function rpc(body: unknown, key: string | null = KEY) {
  return handleMcpRequest(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

const NOTE_TOOLS = [
  "list_campaigns",
  "list_posts",
  "performance_summary",
  "create_campaign",
  "update_campaign_status",
  "create_post",
];
const READ_TOOLS = [
  ...(NOTES_TOOLS ? NOTE_TOOLS.slice(0, 3) : []),
  "meta_list_ads",
  "meta_get_insights",
  "meta_list_campaigns",
  "meta_list_accounts",
  "meta_search_targeting",
  "meta_list_audiences",
  "meta_activity_log",
  "meta_connection_status",
];
const ALL_TOOLS = [
  ...READ_TOOLS,
  ...(NOTES_TOOLS ? NOTE_TOOLS.slice(3) : []),
  "meta_pause_ads",
  "meta_resume_ads",
  "meta_set_budget",
  "meta_update_creative",
  "meta_confirm_action",
  "meta_upload_media",
  "meta_create_ad",
  "meta_sync_now",
  "meta_switch_account",
  "meta_duplicate",
  "meta_update_adset",
  "meta_archive",
];
const FULL_KEY = "sk_meta_test_full_key_for_mcp";

test("rejects requests without a valid api key", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, null);
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("Bearer");
  const bad = await rpc(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    "sk_meta_wrong",
  );
  expect(bad.status).toBe(401);
});

async function toolNames(key: string) {
  const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, key);
  const json = (await list.json()) as { result: { tools: Array<{ name: string }> } };
  return json.result.tools.map((t) => t.name).sort();
}

test("401 points clients at the OAuth metadata", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, null);
  expect(res.headers.get("www-authenticate")).toContain(
    'resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"',
  );
});

test("a browser opening the URL gets a human page", async () => {
  const res = await handleMcpRequest(
    new Request("http://localhost/mcp", { headers: { accept: "text/html" } }),
  );
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Add custom connector");
});

test("a read-only key only sees read tools; a full key sees every tool", async () => {
  expect(await toolNames(KEY)).toEqual([...READ_TOOLS].sort());
  expect(await toolNames(FULL_KEY)).toEqual([...ALL_TOOLS].sort());
});

test("a read-only key cannot call a write tool", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "meta_set_budget", arguments: { objectId: "1", budgetMinorUnits: 500 } },
  });
  const json = (await res.json()) as { result?: { isError?: boolean }; error?: unknown };
  expect(json.error ?? json.result?.isError).toBeTruthy();
});

test("initialize reports the server name", async () => {
  const init = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  expect(init.status).toBe(200);
  const initJson = (await init.json()) as { result: { serverInfo: { name: string } } };
  expect(initJson.result.serverInfo.name).toBe("viral4all-ads-mcp");
});

test.skipIf(!NOTES_TOOLS)("tool calls are scoped to the key's owner", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_campaigns", arguments: {} },
  });
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    result: { structuredContent: { campaigns: Array<{ name: string }> } };
  };
  expect(json.result.structuredContent.campaigns.map((c) => c.name)).toEqual(["Launch"]);
});
