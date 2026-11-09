import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { parseMessages, toolOutput } from "../../cli/lib/mcp.mjs";
import { startFakeServer } from "./fake-server";

const BIN = fileURLToPath(new URL("../../cli/bin/viral4all-ads.mjs", import.meta.url));

let fake: Awaited<ReturnType<typeof startFakeServer>>;
let home: string;

beforeAll(async () => {
  fake = await startFakeServer();
  home = mkdtempSync(join(tmpdir(), "v4a-cli-call-"));
});

afterAll(async () => {
  await fake.close();
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  fake.state.mcp.length = 0;
});

/** Runs the real CLI in a child process (async, so this process's fake server can answer). */
function cli(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      { env: { PATH: process.env.PATH ?? "", XDG_CONFIG_HOME: home, ...env } },
      (err, stdout, stderr) => resolve({ code: err ? Number(err.code) : 0, stdout, stderr }),
    );
  });
}

const withKey = () => ({ VIRAL4ALL_SERVER: fake.base, VIRAL4ALL_API_KEY: "sk_meta_test" });

test("call sends typed flags with the API key and points at the approval link", async () => {
  const { code, stdout, stderr } = await cli(
    [
      "call",
      "meta_set_budget",
      "--object-id",
      "123",
      "--budgetMinorUnits=2500",
      "--kind",
      "lifetime",
    ],
    withKey(),
  );
  expect(code).toBe(0);
  expect(JSON.parse(stdout).received).toEqual({
    objectId: "123",
    budgetMinorUnits: 2500,
    kind: "lifetime",
  });
  expect(stderr).toContain(
    `Approval needed: open ${fake.base}/approve/1 — nothing changes until you approve.`,
  );
  expect(fake.state.mcp.map((r) => r.body.method)).toEqual([
    "initialize",
    "tools/list",
    "tools/call",
  ]);
  expect(fake.state.mcp[2].headers).toMatchObject({
    authorization: "Bearer sk_meta_test",
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-06-18",
  });
});

test("a shortcut maps positional words, and --json prints compact JSON only", async () => {
  const { code, stdout, stderr } = await cli(["budget", "123", "2500", "--json"], withKey());
  expect(code).toBe(0);
  expect(stdout).toBe(
    `${JSON.stringify({
      received: { objectId: "123", budgetMinorUnits: 2500 },
      approve_url: `${fake.base}/approve/1`,
      confirm_token: "ct_1",
    })}\n`,
  );
  expect(stderr).toBe("");
});

test("exit codes: 1 tool error, 2 unknown tool or bad flag, 3 auth", async () => {
  const failed = await cli(["sync"], withKey());
  expect(failed).toMatchObject({ code: 1, stderr: "viral4all-ads: Meta is not connected.\n" });

  const missing = await cli(["insights"], withKey());
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain("meta_get_insights is not available");

  const bad = await cli(["budget", "123", "lots"], withKey());
  expect(bad.code).toBe(2);
  expect(bad.stderr).toContain("--budgetMinorUnits needs a whole number");

  const rejected = await cli(["tools"], { ...withKey(), VIRAL4ALL_API_KEY: "sk_meta_wrong" });
  expect(rejected.code).toBe(3);
  expect(rejected.stderr).toContain("viral4all-ads login");
  expect(rejected.stderr).not.toContain("sk_meta_wrong");

  const anonymous = await cli(["tools"], { VIRAL4ALL_SERVER: fake.base });
  expect(anonymous.code).toBe(3);
  expect(anonymous.stderr).toContain("Not signed in");
});

test("login --key saves a 0600 config, and whoami masks the key", async () => {
  const key = `sk_meta_abcdefgh${"x".repeat(35)}`;
  const env = { VIRAL4ALL_SERVER: fake.base };
  expect((await cli(["login", "--key", key], env)).code).toBe(0);
  expect(statSync(join(home, "viral4all-ads", "config.json")).mode & 0o777).toBe(0o600);
  const who = await cli(["whoami", "--json"], env);
  expect(JSON.parse(who.stdout)).toMatchObject({
    server: fake.base,
    auth: "api key",
    key: "sk_meta_abcdefgh…",
  });
  expect(who.stdout).not.toContain(key);
  expect((await cli(["tools", "--json", "--server", "http://localhost:1"], env)).code).toBe(3);
});

test("tool output prefers structuredContent, then JSON text, then plain text", () => {
  expect(toolOutput({ structuredContent: { a: 1 }, content: [{ text: "{}" }] })).toEqual({ a: 1 });
  expect(toolOutput({ content: [{ type: "text", text: '{"b":2}' }] })).toEqual({ b: 2 });
  expect(toolOutput({ content: [{ type: "text", text: "plain" }] })).toBe("plain");
  expect(() =>
    toolOutput({ content: [{ text: "Blocked by your limits" }], isError: true }),
  ).toThrow("Blocked by your limits");
  expect(parseMessages('data: {"id":1}\r\n\r\ndata: not json\n\n', "text/event-stream")).toEqual([
    { id: 1 },
    null,
  ]);
});
