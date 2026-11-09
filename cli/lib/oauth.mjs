import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { CliError } from "./errors.mjs";

const base64url = (bytes) => Buffer.from(bytes).toString("base64url");

export const pkceChallenge = (verifier) =>
  base64url(createHash("sha256").update(verifier).digest());

export function authorizeUrl(endpoint, params) {
  const url = new URL(endpoint);
  const all = { response_type: "code", code_challenge_method: "S256", ...params };
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
  return url.toString();
}

export async function discover(server) {
  const res = await fetch(`${server}/.well-known/oauth-authorization-server`);
  if (!res.ok) {
    throw new CliError(
      `${server} offers no browser sign-in (HTTP ${res.status}). Use \`viral4all-ads login --key sk_meta_...\`.`,
      3,
    );
  }
  return res.json();
}

/**
 * Best effort: the URL is printed too, so a missing opener is not an error. Only http(s) URLs are
 * opened, and never through a shell, so a hostile authorize URL can't run commands.
 */
export function openBrowser(url) {
  const { protocol } = new URL(url);
  if (protocol !== "https:" && protocol !== "http:") return;
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}

async function tokenRequest(endpoint, fields, failure) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new CliError(
      `${failure}: ${body.error_description || body.error || `HTTP ${res.status}`}`,
      3,
    );
  }
  return body;
}

const withTokens = (config, tokens) => ({
  ...config,
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token ?? config.refresh_token,
  expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  scope: tokens.scope ?? config.scope,
});

/**
 * Browser sign-in: dynamic client registration, PKCE S256 and a one-shot loopback redirect.
 * Returns the config to save. `open` is injectable so tests can follow the redirect themselves.
 */
export async function login({ server, readOnly = false, open = openBrowser, log = console.error }) {
  const meta = await discover(server);
  let receive;
  const callback = new Promise((resolve) => (receive = resolve));
  const http = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") return res.writeHead(404, { Connection: "close" }).end();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", Connection: "close" });
    res.end(
      '<!doctype html><meta charset="utf-8"><title>Viral4All Ads CLI</title><p style="font-family:system-ui">You can close this tab and go back to the terminal.</p>',
    );
    receive(url.searchParams);
  });
  await new Promise((resolve, reject) =>
    http.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  try {
    const redirect_uri = `http://127.0.0.1:${http.address().port}/callback`;
    const reg = await fetch(meta.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [redirect_uri],
        client_name: "Viral4All Ads CLI",
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
      }),
    });
    const client = await reg.json().catch(() => ({}));
    if (!reg.ok || !client.client_id) {
      throw new CliError(
        `Could not register the CLI: ${client.error_description || `HTTP ${reg.status}`}`,
        3,
      );
    }
    const verifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(16));
    const resource = `${server}/mcp`;
    const url = authorizeUrl(meta.authorization_endpoint, {
      client_id: client.client_id,
      redirect_uri,
      code_challenge: pkceChallenge(verifier),
      scope: readOnly ? "mcp:read" : "mcp:read mcp:write",
      state,
      resource,
    });
    log(`Opening your browser to sign in. If it does not open, visit:\n\n  ${url}\n`);
    await open(url);
    const answer = await callback;
    if (answer.get("state") !== state) {
      throw new CliError(
        "Sign-in failed: the browser answered for a different login. Try again.",
        3,
      );
    }
    if (answer.get("error")) {
      throw new CliError(
        `Sign-in was not completed: ${answer.get("error_description") || answer.get("error")}`,
        3,
      );
    }
    // RFC 9207: a code issued by another server must not be redeemed here.
    if (answer.has("iss") && answer.get("iss") !== meta.issuer) {
      throw new CliError("Sign-in failed: the answer came from a different server.", 3);
    }
    const tokens = await tokenRequest(
      meta.token_endpoint,
      {
        grant_type: "authorization_code",
        code: answer.get("code") ?? "",
        code_verifier: verifier,
        client_id: client.client_id,
        redirect_uri,
        resource,
      },
      "Sign-in failed",
    );
    return withTokens({ server, type: "oauth", client_id: client.client_id }, tokens);
  } finally {
    http.close();
  }
}

/** Fresh tokens for a saved sign-in. Refresh tokens rotate, so the result must be saved. */
export async function refresh(config) {
  const meta = await discover(config.server);
  const tokens = await tokenRequest(
    meta.token_endpoint,
    {
      grant_type: "refresh_token",
      refresh_token: config.refresh_token,
      client_id: config.client_id,
      resource: `${config.server}/mcp`,
    },
    "Your sign-in expired (run `viral4all-ads login` again)",
  );
  return withTokens(config, tokens);
}
