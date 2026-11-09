/**
 * HTTP entry for the MCP endpoint. The caller is identified by an `sk_meta_` API key or an OAuth
 * access token (Claude.ai, ChatGPT, Cursor sign in through /oauth/authorize); then a stateless
 * Streamable HTTP session runs against a per-request server that only has the caller's tools.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { callerFromRequest } from "@/lib/api-keys.server";
import { baseFor, callerFromAccessToken } from "@/lib/oauth.server";
import { buildMcpServer, type McpCaller } from "./server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, accept, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
};

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

/** The caller behind an API key or an OAuth access token; null when neither is valid. */
export async function resolveCaller(request: Request): Promise<McpCaller | null> {
  const base = baseFor(request);
  const key = await callerFromRequest(request);
  if (key)
    return {
      userId: key.userId,
      base,
      scopes: key.scopes,
      apiKeyId: key.keyId,
      keyPrefix: key.keyPrefix,
      requester: `key:${key.keyPrefix}`,
    };
  const grant = await callerFromAccessToken(bearerToken(request));
  return (
    grant && {
      userId: grant.userId,
      base,
      scopes: grant.scopes,
      apiKeyId: null,
      keyPrefix: "oauth",
      requester: `app:${grant.clientName}`,
      clientId: grant.clientId,
    }
  );
}

/** What a person sees when they open the MCP URL in a browser. */
function humanPage(base: string) {
  const url = `${base}/mcp`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Viral4All Ads MCP</title></head>
<body style="font-family:system-ui;background:#0d0f0e;color:#e7ece9;max-width:640px;margin:0 auto;padding:48px 24px;line-height:1.6">
<h1>Viral4All Ads MCP</h1>
<p>This address is for AI apps, not browsers. Add it as a connector:</p>
<p><code style="background:#1b201d;padding:6px 10px;border-radius:6px">${url}</code></p>
<p><strong>Claude:</strong> Settings &rarr; Connectors &rarr; Add custom connector, paste the URL, leave the OAuth fields empty, then sign in when asked.</p>
<p><strong>Claude Code:</strong> <code>claude mcp add --transport http viral4all-ads ${url}</code></p>
<p>More clients: <a style="color:#3ddc84" href="${base}/setup">${base}/setup</a></p>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const caller = await resolveCaller(request);
  if (!caller) {
    const base = baseFor(request);
    const accept = request.headers.get("accept") ?? "";
    if (request.method === "GET" && accept.includes("text/html") && !bearerToken(request)) {
      return humanPage(base);
    }
    const invalid = bearerToken(request) ? ', error="invalid_token"' : "";
    return new Response(
      JSON.stringify({
        error:
          "Sign in with OAuth (Claude, ChatGPT and Cursor do this automatically) or send Authorization: Bearer sk_meta_<API key>.",
      }),
      {
        status: 401,
        headers: {
          ...CORS,
          "content-type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"${invalid}`,
        },
      },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildMcpServer(caller);
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  } finally {
    await server.close();
  }
}
