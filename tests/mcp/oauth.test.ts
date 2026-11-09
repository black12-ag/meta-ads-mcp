import { createHash } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import {
  approveAuthorization,
  authorizationServerMetadata,
  checkAuthorizeRequest,
  cleanClientName,
  denyAuthorization,
  exchangeToken,
  isAllowedRedirectUri,
  OAuthError,
  redirectMatches,
  registerClient,
} from "@/lib/oauth.server";
import { listOAuthGrantsByUser, revokeOAuthGrant } from "@/lib/db/oauth.server";
import { handleMcpRequest } from "@/lib/mcp/handler.server";

const BASE = "http://localhost";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(43) + "-verifier_0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

beforeAll(resetDatabase);

function authParams(clientId: string, extra: Record<string, string> = {}) {
  return {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "123",
    resource: `${BASE}/mcp`,
    ...extra,
  };
}

async function codeFor(clientId: string, allowWrite = true, user = "oauth-user") {
  const url = new URL(await approveAuthorization(user, authParams(clientId), allowWrite, BASE));
  expect(url.searchParams.get("state")).toBe("123");
  expect(url.searchParams.get("iss")).toBe(BASE);
  return url.searchParams.get("code")!;
}

const form = (v: Record<string, string>) => new URLSearchParams(v);

async function toolNames(accessToken: string) {
  const res = await handleMcpRequest(
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );
  if (res.status !== 200) return res.status;
  const json = (await res.json()) as { result: { tools: Array<{ name: string }> } };
  return json.result.tools.map((t) => t.name);
}

test("metadata advertises PKCE S256 and our endpoints", () => {
  const m = authorizationServerMetadata(BASE);
  expect(m.code_challenge_methods_supported).toEqual(["S256"]);
  expect(m.registration_endpoint).toBe(`${BASE}/oauth/register`);
});

test("redirect URIs: https, loopback http and app schemes only", () => {
  expect(isAllowedRedirectUri(REDIRECT)).toBe(true);
  expect(isAllowedRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
  expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
  expect(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
  expect(isAllowedRedirectUri("http://evil.example/cb")).toBe(false);
  expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
  expect(isAllowedRedirectUri("https://claude.ai/cb#frag")).toBe(false);
});

test("registration rejects bad redirect URIs", async () => {
  await expect(
    registerClient({ redirect_uris: ["http://evil.example/cb"] }),
  ).rejects.toBeInstanceOf(OAuthError);
  await expect(registerClient({})).rejects.toBeInstanceOf(OAuthError);
});

test("full flow: register, approve, exchange, use, refresh with rotation", async () => {
  const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
  expect(client.token_endpoint_auth_method).toBe("none");
  const code = await codeFor(client.client_id);

  const tokens = await exchangeToken(
    form({
      grant_type: "authorization_code",
      code,
      code_verifier: VERIFIER,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
    }),
    null,
  );
  expect(tokens.scope).toBe("mcp:read mcp:write");
  expect(await toolNames(tokens.access_token)).toContain("meta_set_budget");

  // the code is single use
  await expect(
    exchangeToken(
      form({
        grant_type: "authorization_code",
        code,
        code_verifier: VERIFIER,
        client_id: client.client_id,
      }),
      null,
    ),
  ).rejects.toMatchObject({ code: "invalid_grant" });

  const refreshed = await exchangeToken(
    form({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    }),
    null,
  );
  expect(refreshed.access_token).not.toBe(tokens.access_token);
  expect(await toolNames(refreshed.access_token)).toContain("meta_list_ads");
  // the old access token and the old refresh token stop working
  expect(await toolNames(tokens.access_token)).toBe(401);
  await expect(
    exchangeToken(
      form({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
      }),
      null,
    ),
  ).rejects.toMatchObject({ code: "invalid_grant" });
});

test("wrong PKCE verifier and wrong redirect are rejected", async () => {
  const client = await registerClient({ redirect_uris: [REDIRECT] });
  const code = await codeFor(client.client_id);
  await expect(
    exchangeToken(
      form({
        grant_type: "authorization_code",
        code,
        code_verifier: "x".repeat(50),
        client_id: client.client_id,
      }),
      null,
    ),
  ).rejects.toMatchObject({ code: "invalid_grant" });

  const code2 = await codeFor(client.client_id);
  await expect(
    exchangeToken(
      form({
        grant_type: "authorization_code",
        code: code2,
        code_verifier: VERIFIER,
        redirect_uri: "https://other.example/cb",
        client_id: client.client_id,
      }),
      null,
    ),
  ).rejects.toMatchObject({ code: "invalid_grant" });
});

test("authorize refuses unregistered redirects, missing PKCE and foreign resources", async () => {
  const client = await registerClient({ redirect_uris: [REDIRECT] });
  await expect(
    checkAuthorizeRequest(
      authParams(client.client_id, { redirect_uri: "https://evil.example/cb" }),
      BASE,
    ),
  ).rejects.toBeInstanceOf(OAuthError);
  await expect(
    checkAuthorizeRequest(authParams(client.client_id, { code_challenge_method: "plain" }), BASE),
  ).rejects.toBeInstanceOf(OAuthError);
  await expect(
    checkAuthorizeRequest(
      authParams(client.client_id, { resource: "https://other.example/mcp" }),
      BASE,
    ),
  ).rejects.toMatchObject({ code: "invalid_target" });

  const denied = new URL(await denyAuthorization(authParams(client.client_id), BASE));
  expect(denied.searchParams.get("error")).toBe("access_denied");
  expect(denied.searchParams.get("state")).toBe("123");
});

test("unticking write gives a read-only grant with read tools only", async () => {
  const client = await registerClient({ redirect_uris: [REDIRECT] });
  const tokens = await exchangeToken(
    form({
      grant_type: "authorization_code",
      code: await codeFor(client.client_id, false),
      code_verifier: VERIFIER,
      client_id: client.client_id,
    }),
    null,
  );
  expect(tokens.scope).toBe("mcp:read");
  const names = await toolNames(tokens.access_token);
  expect(names).toContain("meta_list_ads");
  expect(names).not.toContain("meta_set_budget");
  expect(names).not.toContain("meta_confirm_action");
});

test("confidential clients must send their secret", async () => {
  const client = await registerClient({
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "client_secret_post",
  });
  expect(client.client_secret).toBeTruthy();
  const code = await codeFor(client.client_id);
  const base = {
    grant_type: "authorization_code",
    code,
    code_verifier: VERIFIER,
    client_id: client.client_id,
  };
  await expect(exchangeToken(form(base), null)).rejects.toMatchObject({ code: "invalid_client" });

  const code2 = await codeFor(client.client_id);
  const basic =
    "Basic " + Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64");
  const ok = await exchangeToken(form({ ...base, code: code2 }), basic);
  expect(ok.token_type).toBe("Bearer");
});

test("revoking a connected app cuts its token off", async () => {
  const client = await registerClient({ client_name: "Cursor", redirect_uris: [REDIRECT] });
  const tokens = await exchangeToken(
    form({
      grant_type: "authorization_code",
      code: await codeFor(client.client_id, true, "revoke-user"),
      code_verifier: VERIFIER,
      client_id: client.client_id,
    }),
    null,
  );
  const [grant] = await listOAuthGrantsByUser("revoke-user");
  expect(grant.client_name).toBe("Cursor");
  await revokeOAuthGrant("revoke-user", grant.id);
  expect(await toolNames(tokens.access_token)).toBe(401);
  expect(await listOAuthGrantsByUser("revoke-user")).toEqual([]);
});

test("app names are cleaned at registration", () => {
  expect(cleanClientName("  Claude\u0000\n  ")).toBe("Claude");
  expect(cleanClientName("x".repeat(200))).toHaveLength(80);
  expect(cleanClientName("\u0007")).toBeNull();
});

test("loopback redirects match on any port; everything else must match exactly", () => {
  const registered = ["http://127.0.0.1:53111/callback", "https://claude.ai/api/mcp/auth_callback"];
  expect(redirectMatches(registered, "http://127.0.0.1:61234/callback")).toBe(true);
  expect(redirectMatches(registered, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
  expect(redirectMatches(registered, "http://127.0.0.1:61234/other")).toBe(false);
  expect(redirectMatches(registered, "http://localhost:61234/callback")).toBe(false);
  expect(redirectMatches(registered, "http://evil.example:53111/callback")).toBe(false);
  expect(redirectMatches(registered, "https://claude.ai:8443/api/mcp/auth_callback")).toBe(false);
});
