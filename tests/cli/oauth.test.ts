import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { readConfig, session, writeConfig } from "../../cli/lib/config.mjs";
import { connect } from "../../cli/lib/mcp.mjs";
import { authorizeUrl, login, pkceChallenge } from "../../cli/lib/oauth.mjs";
import { startFakeServer } from "./fake-server";

let fake: Awaited<ReturnType<typeof startFakeServer>>;
let home: string;
const previousHome = process.env.XDG_CONFIG_HOME;

beforeAll(async () => {
  fake = await startFakeServer();
  home = mkdtempSync(join(tmpdir(), "v4a-cli-oauth-"));
  process.env.XDG_CONFIG_HOME = home;
});

afterAll(async () => {
  await fake.close();
  rmSync(home, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = previousHome;
});

// Plays the browser: the fake consent page redirects straight to the CLI's loopback callback.
const browser = async (url: string) => {
  await fetch(url);
};

test("PKCE S256 challenge matches RFC 7636 appendix B", () => {
  expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("authorize URL carries PKCE, state, scope and resource", () => {
  const params = {
    client_id: "c1",
    redirect_uri: "http://127.0.0.1:5000/callback",
    code_challenge: "abc",
    scope: "mcp:read",
    state: "s1",
    resource: "https://ads.viral4all.com/mcp",
  };
  const url = new URL(authorizeUrl("https://ads.viral4all.com/oauth/authorize", params));
  expect(url.origin + url.pathname).toBe("https://ads.viral4all.com/oauth/authorize");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    response_type: "code",
    code_challenge_method: "S256",
    ...params,
  });
});

test("login registers a loopback client, follows the redirect and redeems the code with PKCE", async () => {
  const config = await login({ server: fake.base, open: browser, log: () => {} });
  const redirect = fake.state.registered.redirect_uris?.[0];
  expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  expect(fake.state.registered).toMatchObject({
    client_name: "Viral4All Ads CLI",
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
  });
  expect(Object.fromEntries(fake.state.authorize)).toMatchObject({
    client_id: "client_1",
    redirect_uri: redirect,
    code_challenge_method: "S256",
    scope: "mcp:read mcp:write",
    resource: `${fake.base}/mcp`,
  });
  expect(config).toMatchObject({
    server: fake.base,
    type: "oauth",
    client_id: "client_1",
    access_token: "at_1",
    refresh_token: "rt_1",
    scope: "mcp:read mcp:write",
  });
  expect(config.expires_at).toBeGreaterThan(Date.now() + 3_500_000);
});

test("--read-only asks for mcp:read, and an answer meant for another login is refused", async () => {
  fake.state.forgeState = "forged";
  const err = await login({
    server: fake.base,
    readOnly: true,
    open: browser,
    log: () => {},
  }).catch((e: unknown) => e);
  fake.state.forgeState = undefined;
  expect(fake.state.authorize.get("scope")).toBe("mcp:read");
  expect(err).toMatchObject({ exitCode: 3, message: expect.stringContaining("different login") });
});

test("a 401 refreshes the token, retries once and saves the rotated tokens", async () => {
  fake.state.refreshToken = "rt_1";
  fake.state.refreshes = 0;
  fake.state.mcp.length = 0;
  writeConfig({
    server: fake.base,
    type: "oauth",
    client_id: "client_1",
    access_token: "revoked",
    refresh_token: "rt_1",
    expires_at: Date.now() + 3_600_000,
  });
  const tools = await connect(session(undefined, {})).listTools();
  expect(tools.map((t: { name: string }) => t.name)).toContain("meta_set_budget");
  expect(fake.state.refreshes).toBe(1);
  expect(fake.state.mcp.map((r) => r.headers.authorization)).toEqual([
    "Bearer revoked",
    "Bearer at_2",
    "Bearer at_2",
  ]);
  expect(readConfig()).toMatchObject({ access_token: "at_2", refresh_token: "rt_2" });
});

test("an expired token is refreshed before the request", async () => {
  fake.state.mcp.length = 0;
  writeConfig({ ...readConfig(), expires_at: Date.now() - 1000 });
  await connect(session(undefined, {})).listTools();
  expect(fake.state.refreshes).toBe(2);
  expect(fake.state.mcp.every((r) => r.headers.authorization === "Bearer at_3")).toBe(true);
  expect(readConfig()).toMatchObject({ access_token: "at_3", refresh_token: "rt_3" });
});

test("when a parallel run rotated the refresh token first, its saved tokens are used", async () => {
  const client = connect({ ...readConfig(), access_token: "revoked", refresh_token: "rt_old" });
  await expect(client.listTools()).resolves.toHaveLength(2);
  expect(fake.state.refreshes).toBe(2);
  expect(readConfig()).toMatchObject({ access_token: "at_3", refresh_token: "rt_3" });
});
