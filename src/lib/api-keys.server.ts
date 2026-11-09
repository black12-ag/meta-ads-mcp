/**
 * API keys for the CLI / headless AI access. Only a SHA-256 hash is stored;
 * the plaintext is shown to the user exactly once.
 */
import { ALL_SCOPES, DEFAULT_SCOPES, type ApiScope } from "@/lib/api-scopes";
import {
  findApiKeyByHash,
  insertApiKey,
  listApiKeysByUser,
  revokeApiKey as revokeApiKeyRow,
  touchApiKey,
  updateApiKeyScopes as updateApiKeyScopesRow,
} from "@/lib/db/keys.server";

const encoder = new TextEncoder();

export async function hashKey(plain: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(plain));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `sk_meta_${body}`;
}

function cleanScopes(scopes: string[]) {
  return scopes.filter((s) => (ALL_SCOPES as string[]).includes(s));
}

export async function createApiKey(userId: string, name: string, scopes: string[]) {
  const key = randomKey();
  const clean = cleanScopes(scopes);
  const data = await insertApiKey({
    user_id: userId,
    name,
    scopes: clean.length ? clean : DEFAULT_SCOPES,
    key_prefix: key.slice(0, 16),
    key_hash: await hashKey(key),
  });
  return { ...data, key };
}

export async function updateApiKeyScopes(userId: string, id: string, scopes: string[]) {
  await updateApiKeyScopesRow(userId, id, cleanScopes(scopes));
  return { ok: true as const };
}

export async function listApiKeys(userId: string) {
  return listApiKeysByUser(userId);
}

export async function revokeApiKey(userId: string, id: string) {
  await revokeApiKeyRow(userId, id);
  return { ok: true as const };
}

/** Resolve the caller of a public API request. Returns null when unauthorised. */
export async function callerFromRequest(
  request: Request,
): Promise<{ userId: string; scopes: string[]; keyId: string; keyPrefix: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const key = bearer || (request.headers.get("x-api-key") ?? "").trim();
  if (!key.startsWith("sk_meta_")) return null;

  const data = await findApiKeyByHash(await hashKey(key));
  if (!data || data.revoked_at) return null;

  await touchApiKey(data.id);
  return {
    userId: data.user_id,
    scopes: data.scopes ?? [],
    keyId: data.id,
    keyPrefix: data.key_prefix ?? key.slice(0, 16),
  };
}

export async function userFromRequest(request: Request): Promise<string | null> {
  return (await callerFromRequest(request))?.userId ?? null;
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });

export const preflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });

/** Wrap a handler with API-key auth, scope enforcement, auditing and errors. */
export async function withApiKey(
  request: Request,
  scope: ApiScope,
  handler: (userId: string) => Promise<Response>,
): Promise<Response> {
  const { recordAudit, actionFromPath } = await import("@/lib/audit.server");
  const path = new URL(request.url).pathname;
  const action = actionFromPath(request.method, path);
  const started = Date.now();

  const caller = await callerFromRequest(request);
  if (!caller) {
    return json({ error: "Invalid or missing API key. Send Authorization: Bearer sk_meta_…" }, 401);
  }
  if (!caller.scopes.includes(scope)) {
    await recordAudit({
      userId: caller.userId,
      apiKeyId: caller.keyId,
      keyPrefix: caller.keyPrefix,
      action,
      method: request.method,
      path,
      ok: false,
      statusCode: 403,
      durationMs: Date.now() - started,
      detail: { required_scope: scope, granted_scopes: caller.scopes },
      error: `Missing "${scope}" permission`,
    });
    return json(
      {
        error: `This API key is missing the "${scope}" permission.`,
        required_scope: scope,
        granted_scopes: caller.scopes,
      },
      403,
    );
  }
  try {
    const response = await handler(caller.userId);
    await recordAudit({
      userId: caller.userId,
      apiKeyId: caller.keyId,
      keyPrefix: caller.keyPrefix,
      action,
      method: request.method,
      path,
      ok: response.status < 400,
      statusCode: response.status,
      durationMs: Date.now() - started,
      detail: { scope },
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    const { classifyError } = await import("@/lib/meta/sync.server");
    const kind = classifyError(message);
    const status =
      kind === "permission" || kind === "token" ? 403 : kind === "rate_limit" ? 429 : 400;
    await recordAudit({
      userId: caller.userId,
      apiKeyId: caller.keyId,
      keyPrefix: caller.keyPrefix,
      action,
      method: request.method,
      path,
      ok: false,
      statusCode: status,
      durationMs: Date.now() - started,
      detail: { scope, kind },
      error: message,
    });
    return json({ error: message, kind }, status);
  }
}
