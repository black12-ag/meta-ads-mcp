/**
 * Meta Graph API helpers. Server-only — never import from client code.
 */
import { assertServerSecrets } from "@/lib/env-assert.server";


export const GRAPH_VERSION = "v24.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const META_SCOPES = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "business_management",
];

export function metaAppCreds() {
  assertServerSecrets();
  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  return { appId, appSecret };
}

/**
 * Public origin Meta redirects back to. PUBLIC_BASE_URL wins when set (e.g.
 * https://ads.viral4all.com) so the redirect URI stays stable
 * across preview/published hosts; otherwise fall back to the request origin.
 */
export function publicOrigin(origin: string) {
  const configured = process.env["PUBLIC_BASE_URL"]?.trim();
  return (configured || origin).replace(/\/$/, "");
}

/**
 * The redirect URI sent to Meta. It must match one of the app's registered "Valid OAuth Redirect
 * URIs" character for character, so META_REDIRECT_URI wins when set; otherwise we build the
 * app's own callback from the public origin.
 */
export function callbackUrl(origin: string) {
  const configured = process.env["META_REDIRECT_URI"]?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `${publicOrigin(origin)}/api/public/meta/callback`;
}


export function authorizeUrl(origin: string, state: string) {
  const { appId } = metaAppCreds();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl(origin),
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function readError(res: Response) {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body);
    const err = parsed?.error;
    if (err) {
      return `Meta API ${res.status}: ${err.message}${err.error_user_msg ? ` — ${err.error_user_msg}` : ""}`;
    }
  } catch {
    /* fall through to raw body */
  }
  return `Meta API ${res.status}: ${body.slice(0, 500)}`;
}

export async function graphGet<T = any>(
  path: string,
  token: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const search = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const res = await fetch(`${GRAPH}/${path.replace(/^\//, "")}?${search.toString()}`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

/**
 * Follow Graph pagination to the end of an edge. Meta caps a page at a few hundred rows, so a
 * single request silently truncates large accounts; this keeps asking until `paging.next` is gone.
 * `maxPages` is a safety stop, not a limit we expect to hit.
 */
export async function graphGetAll<T = any>(
  path: string,
  token: string,
  params: Record<string, string | number | undefined> = {},
  maxPages = 50,
): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<{ data?: T[]; paging?: { next?: string } }>(path, token, {
    limit: 200,
    ...params,
  });
  out.push(...(page.data ?? []));

  for (let i = 1; i < maxPages && page.paging?.next; i += 1) {
    const res = await fetch(page.paging.next);
    if (!res.ok) throw new Error(await readError(res));
    page = (await res.json()) as typeof page;
    out.push(...(page.data ?? []));
  }
  return out;
}

export async function graphPost<T = any>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const form = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(`${GRAPH}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

export async function exchangeCodeForToken(code: string, origin: string) {
  const { appId, appSecret } = metaAppCreds();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: callbackUrl(origin),
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(await readError(res));
  const json = (await res.json()) as { access_token: string; expires_in?: number };

  // Upgrade to a long-lived (≈60 day) token.
  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: json.access_token,
  });
  const longRes = await fetch(`${GRAPH}/oauth/access_token?${longParams.toString()}`);
  if (!longRes.ok) return { token: json.access_token, expiresIn: json.expires_in ?? null };
  const longJson = (await longRes.json()) as { access_token: string; expires_in?: number };
  return { token: longJson.access_token, expiresIn: longJson.expires_in ?? null };
}

export interface MetaProfile {
  id: string;
  name?: string;
  picture?: { data?: { url?: string } };
}

export async function fetchProfile(token: string) {
  return graphGet<MetaProfile>("me", token, { fields: "id,name,picture.width(160)" });
}

export async function fetchAdAccounts(token: string) {
  const res = await graphGet<{ data: any[] }>("me/adaccounts", token, {
    fields:
      "account_id,name,currency,timezone_name,account_status,spend_cap,amount_spent,business{name}",
    limit: 200,
  });
  return res.data ?? [];
}

export async function fetchPages(token: string) {
  const res = await graphGet<{ data: any[] }>("me/accounts", token, {
    fields: "id,name,category,tasks,picture.width(160),instagram_business_account{id}",
    limit: 200,
  });
  return res.data ?? [];
}

export const toCents = (v: unknown) => Math.round(Number(v ?? 0));
