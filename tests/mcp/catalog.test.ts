import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import { hashKey } from "@/lib/api-keys.server";
import { insertApiKey } from "@/lib/db/keys.server";
import {
  listToolsRequest,
  llmsText,
  openApiDocument,
  runToolRequest,
  toolCatalog,
} from "@/lib/mcp/local.server";
import { TOOL_SCOPES } from "@/lib/mcp/server";

const READ_KEY = "sk_meta_catalog_read_only_key";

beforeAll(async () => {
  await resetDatabase();
  await insertApiKey({
    user_id: "cat-user",
    name: "read",
    key_prefix: READ_KEY.slice(0, 16),
    key_hash: await hashKey(READ_KEY),
    scopes: ["ads:read"],
  });
});

const call = (name: string, body: unknown, key: string | null = READ_KEY) =>
  runToolRequest(
    new Request(`http://localhost/api/public/v1/tools/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    name,
  );

test("MCP, the REST endpoint, OpenAPI and llms.txt describe the same tools", async () => {
  const names = (await toolCatalog()).map((t) => t.name).sort();
  expect(names).toEqual(Object.keys(TOOL_SCOPES).sort());

  const doc = await openApiDocument("https://ads.example");
  const ops = Object.keys(doc.paths)
    .filter((p) => p !== "/api/public/v1/tools")
    .map((p) => p.split("/").pop())
    .sort();
  expect(ops).toEqual(names);
  for (const path of Object.values(doc.paths) as Array<Record<string, { description?: string }>>) {
    for (const op of Object.values(path))
      expect((op.description ?? "").length).toBeLessThanOrEqual(300);
  }

  const llms = await llmsText("https://ads.example");
  for (const name of names) expect(llms).toContain(`\`${name}\``);
  expect(llms).toContain("https://ads.example/mcp");
});

test("the REST tools endpoint runs a tool within the key's permissions", async () => {
  expect((await call("meta_list_accounts", {}, null)).status).toBe(401);

  const accounts = await call("meta_list_accounts", {});
  expect(accounts.status).toBe(200);
  expect(await accounts.json()).toMatchObject({ connected: false, accounts: [] });

  const budget = await call("meta_set_budget", { objectId: "1", budgetMinorUnits: 500 });
  expect(budget.status).toBe(403);
  expect(await budget.json()).toMatchObject({ error: expect.stringMatching(/ads:budget/) });

  expect((await call("no_such_tool", {})).status).toBe(404);
  expect((await call("meta_list_accounts", "not json")).status).toBe(400);
  expect((await call("meta_activity_log", { limit: "many" })).status).toBe(400);

  const list = await listToolsRequest(
    new Request("http://localhost/api/public/v1/tools", {
      headers: { authorization: `Bearer ${READ_KEY}` },
    }),
  );
  const names = ((await list.json()) as { tools: Array<{ name: string }> }).tools.map(
    (t) => t.name,
  );
  expect(names).toContain("meta_get_insights");
  expect(names).not.toContain("meta_set_budget");
});

test("every tool says whether it reads, changes or destroys (directories check this)", async () => {
  for (const t of await toolCatalog()) {
    expect(t.title, t.name).toBeTruthy();
    // ChatGPT's directory wants all three as explicit booleans on every tool
    for (const hint of ["readOnlyHint", "destructiveHint", "openWorldHint"] as const) {
      expect(typeof t.annotations?.[hint], `${t.name}.${hint}`).toBe("boolean");
    }
  }
});
