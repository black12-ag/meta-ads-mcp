/**
 * OAuth 2.1 authorization server for MCP clients (Claude, ChatGPT, Cursor): RFC 8414 / RFC 9728
 * metadata, RFC 7591 dynamic registration, PKCE S256 only, rotating refresh tokens.
 * Codes, tokens and client secrets are stored as SHA-256 hashes. Server-only.
 */
import { z } from "zod";
import { ALL_SCOPES, type ApiScope } from "@/lib/api-scopes";
import { hashKey } from "@/lib/api-keys.server";
import { publicOrigin } from "@/lib/meta/graph.server";
import {
  consumeOAuthCode,
  findGrantByAccessHash,
  findOAuthClient,
  insertOAuthClient,
  insertOAuthCode,
  insertOAuthGrant,
  rotateOAuthGrant,
} from "@/lib/db/oauth.server";

export const MCP_SCOPES = ["mcp:read", "mcp:write"] as const;

const CODE_TTL_MS = 10 * 60_000;
const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_MS = 60 * 24 * 60 * 60_000;

export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
}

/** Issuer / public origin for a request: PUBLIC_BASE_URL wins, as for the Meta callback. */
export const baseFor = (request: Request) => publicOrigin(new URL(request.url).origin);

export const mcpResource = (base: string) => `${base}/mcp`;

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [...MCP_SCOPES],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/docs`,
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: mcpResource(base),
    authorization_servers: [base],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Viral4All Ads",
    resource_documentation: `${base}/docs#mcp`,
  };
}

/** What an OAuth grant may do in API-scope terms: read-only grants can only read. */
export function apiScopesFor(scopes: string[]): ApiScope[] {
  if (scopes.includes("mcp:write")) return [...ALL_SCOPES];
  return scopes.includes("mcp:read") ? ["ads:read"] : [];
}

function randomToken(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return prefix + Buffer.from(bytes).toString("base64url");
}

const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https anywhere, http only on loopback (RFC 8252), or a private app scheme such as cursor://. */
export function isAllowedRedirectUri(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !BLOCKED_SCHEMES.has(url.protocol);
}

/**
 * The registered address, or the same loopback http address on another port: RFC 8252 lets
 * native apps (Claude Code, CLIs) pick a free port each time they sign in.
 */
export function redirectMatches(registered: string[], requested: string) {
  if (registered.includes(requested)) return true;
  let want: URL;
  try {
    want = new URL(requested);
  } catch {
    return false;
  }
  if (want.protocol !== "http:" || !LOOPBACK.has(want.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return (
        u.protocol === "http:" &&
        u.hostname === want.hostname &&
        u.pathname === want.pathname &&
        u.search === want.search
      );
    } catch {
      return false;
    }
  });
}

// ---- dynamic client registration (RFC 7591) ----

/** App names are chosen by the app: drop control characters and cap the length. */
export function cleanClientName(name?: string) {
  const clean = [...(name ?? "")]
    .filter((c) => c.charCodeAt(0) >= 0x20)
    .join("")
    .trim()
    .slice(0, 80);
  return clean || null;
}

const registrationSchema = z
  .object({
    redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
    client_name: z.string().max(200).optional(),
    token_endpoint_auth_method: z.string().max(40).optional(),
  })
  .passthrough();

export async function registerClient(body: unknown) {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    throw new OAuthError("invalid_client_metadata", "redirect_uris (1-10 URLs) is required.");
  }
  const bad = parsed.data.redirect_uris.find((u) => !isAllowedRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);

  const method = parsed.data.token_endpoint_auth_method;
  const confidential = method === "client_secret_post" || method === "client_secret_basic";
  const clientId = randomToken("mcpc_");
  const secret = confidential ? randomToken("mcps_") : null;
  const row = await insertOAuthClient({
    client_id: clientId,
    client_name: cleanClientName(parsed.data.client_name),
    redirect_uris: parsed.data.redirect_uris,
    client_secret_hash: secret ? await hashKey(secret) : null,
  });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.parse(row.created_at) / 1000),
    client_name: row.client_name ?? undefined,
    redirect_uris: row.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: confidential ? method : "none",
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

// ---- authorization endpoint ----

export const authorizeSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(200),
  redirect_uri: z.string().min(1).max(2000),
  code_challenge: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  code_challenge_method: z.literal("S256"),
  scope: z.string().max(500).optional(),
  state: z.string().max(2000).optional(),
  resource: z.string().max(2000).optional(),
});
export type AuthorizeParams = z.infer<typeof authorizeSchema>;

/** Unknown scopes are ignored; nothing recognised means the full set. Write always implies read. */
function requestedScopes(scope?: string) {
  const asked = (scope ?? "").split(/\s+/);
  if (asked.includes("mcp:write")) return ["mcp:read", "mcp:write"];
  if (asked.includes("mcp:read")) return ["mcp:read"];
  return [...MCP_SCOPES];
}

export async function checkAuthorizeRequest(input: unknown, base: string) {
  const parsed = authorizeSchema.safeParse(input);
  if (!parsed.success) {
    throw new OAuthError(
      "invalid_request",
      "Missing or invalid authorization parameters. PKCE with S256 is required.",
    );
  }
  const params = parsed.data;
  const client = await findOAuthClient(params.client_id);
  if (!client) {
    throw new OAuthError("invalid_client", "Unknown app. Remove the connector and add it again.");
  }
  if (!redirectMatches(client.redirect_uris, params.redirect_uri)) {
    throw new OAuthError("invalid_request", "This redirect address is not registered for the app.");
  }
  if (params.resource) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(params.resource).origin === new URL(base).origin;
    } catch {
      // stays false
    }
    if (!sameOrigin)
      throw new OAuthError("invalid_target", "The requested resource is not this server.");
  }
  return {
    params,
    clientName: client.client_name,
    redirectHost: new URL(params.redirect_uri).host || params.redirect_uri,
    scopes: requestedScopes(params.scope),
  };
}

function redirectWith(params: AuthorizeParams, base: string, values: Record<string, string>) {
  const url = new URL(params.redirect_uri);
  for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
  if (params.state) url.searchParams.set("state", params.state);
  url.searchParams.set("iss", base);
  return url.toString();
}

/** Signed-in user approved: store a one-time code and return where to send the browser. */
export async function approveAuthorization(
  userId: string,
  input: unknown,
  allowWrite: boolean,
  base: string,
) {
  const { params, scopes } = await checkAuthorizeRequest(input, base);
  const granted = allowWrite ? scopes : scopes.filter((s) => s !== "mcp:write");
  const code = randomToken("mcp_code_");
  await insertOAuthCode({
    code_hash: await hashKey(code),
    client_id: params.client_id,
    user_id: userId,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    scopes: granted,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return redirectWith(params, base, { code });
}

export async function denyAuthorization(input: unknown, base: string) {
  const { params } = await checkAuthorizeRequest(input, base);
  return redirectWith(params, base, {
    error: "access_denied",
    error_description: "The user declined.",
  });
}

// ---- token endpoint ----

async function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url") === challenge;
}

function clientCredentials(form: URLSearchParams, authorization: string | null) {
  if (authorization?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authorization.slice(6).trim(), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i > 0) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, i)),
        secret: decodeURIComponent(decoded.slice(i + 1)),
      };
    }
  }
  return { clientId: form.get("client_id"), secret: form.get("client_secret") };
}

function tokenResponse(access: string, refresh: string, scopes: string[]) {
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope: scopes.join(" "),
  };
}

function freshTokens() {
  return {
    access: randomToken("mcp_at_"),
    refresh: randomToken("mcp_rt_"),
    accessExpires: new Date(Date.now() + ACCESS_TTL_S * 1000).toISOString(),
    refreshExpires: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  };
}

export async function exchangeToken(form: URLSearchParams, authorization: string | null) {
  const { clientId, secret } = clientCredentials(form, authorization);
  if (!clientId) throw new OAuthError("invalid_client", "client_id is required.", 401);
  const client = await findOAuthClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);
  if (
    client.client_secret_hash &&
    (!secret || (await hashKey(secret)) !== client.client_secret_hash)
  ) {
    throw new OAuthError("invalid_client", "Client authentication failed.", 401);
  }

  const grantType = form.get("grant_type");
  const t = freshTokens();

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || !verifier) {
      throw new OAuthError("invalid_request", "code and code_verifier are required.");
    }
    const row = await consumeOAuthCode(await hashKey(code));
    const redirect = form.get("redirect_uri");
    if (
      !row ||
      row.client_id !== clientId ||
      Date.parse(row.expires_at) < Date.now() ||
      (redirect && redirect !== row.redirect_uri) ||
      !(await pkceMatches(verifier, row.code_challenge))
    ) {
      throw new OAuthError(
        "invalid_grant",
        "The authorization code is invalid, expired or already used.",
      );
    }
    await insertOAuthGrant({
      user_id: row.user_id,
      client_id: clientId,
      scopes: row.scopes,
      access_hash: await hashKey(t.access),
      access_expires_at: t.accessExpires,
      refresh_hash: await hashKey(t.refresh),
      refresh_expires_at: t.refreshExpires,
    });
    return tokenResponse(t.access, t.refresh, row.scopes);
  }

  if (grantType === "refresh_token") {
    const refresh = form.get("refresh_token");
    if (!refresh) throw new OAuthError("invalid_request", "refresh_token is required.");
    const row = await rotateOAuthGrant(await hashKey(refresh), clientId, {
      access_hash: await hashKey(t.access),
      access_expires_at: t.accessExpires,
      refresh_hash: await hashKey(t.refresh),
      refresh_expires_at: t.refreshExpires,
    });
    if (!row)
      throw new OAuthError("invalid_grant", "The refresh token is invalid, expired or revoked.");
    return tokenResponse(t.access, t.refresh, row.scopes);
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

// ---- HTTP helpers for the OAuth routes (browser-based clients call these cross-origin) ----

const OAUTH_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

export const oauthJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: OAUTH_HEADERS });

export const oauthPreflight = () => new Response(null, { status: 204, headers: OAUTH_HEADERS });

export function oauthErrorResponse(err: unknown) {
  if (err instanceof OAuthError) {
    return oauthJson({ error: err.code, error_description: err.description }, err.status);
  }
  console.error("[oauth]", err instanceof Error ? err.message : err);
  return oauthJson({ error: "server_error", error_description: "Something went wrong." }, 500);
}

/** Form-encoded per RFC 6749; JSON bodies are accepted too because some clients send them. */
export async function readForm(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(
      Object.entries(body).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  }
  return new URLSearchParams(await request.text());
}

/** The caller behind an OAuth access token, or null. */
export async function callerFromAccessToken(token: string) {
  if (!token.startsWith("mcp_at_")) return null;
  const grant = await findGrantByAccessHash(await hashKey(token));
  if (!grant) return null;
  return {
    userId: grant.user_id,
    scopes: apiScopesFor(grant.scopes),
    grantId: grant.id,
    clientId: grant.client_id,
    clientName: grant.client_name ?? "AI app",
  };
}
