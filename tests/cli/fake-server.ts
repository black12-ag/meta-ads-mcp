import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

export const TOOLS = [
  {
    name: "meta_set_budget",
    description: "Ask to set a budget. Nothing changes until the owner approves.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: { type: "string", minLength: 1 },
        kind: { type: "string", enum: ["daily", "lifetime"], default: "daily" },
        budgetMinorUnits: { type: "integer", minimum: 100 },
      },
      required: ["objectId", "budgetMinorUnits"],
    },
  },
  {
    name: "meta_sync_now",
    description: "Refresh data.",
    inputSchema: { type: "object", properties: {} },
  },
];

type McpRequest = {
  headers: IncomingHttpHeaders;
  body: { id: number; method: string; params: { name: string; arguments: object } };
};

/** One local server playing both the OAuth authorization server and the MCP endpoint. */
export async function startFakeServer() {
  const state = {
    tokens: new Set(["sk_meta_test"]),
    refreshToken: "rt_1",
    refreshes: 0,
    registered: {} as { redirect_uris?: string[]; [key: string]: unknown },
    authorize: new URLSearchParams(),
    forgeState: undefined as string | undefined,
    mcp: [] as McpRequest[],
  };
  let base = "";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", base);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const tokens = (n: number, scope: string | null) => {
      state.refreshToken = `rt_${n}`;
      state.tokens.add(`at_${n}`);
      const body = { access_token: `at_${n}`, token_type: "Bearer", expires_in: 3600, scope };
      return send(200, { ...body, refresh_token: state.refreshToken });
    };

    switch (`${req.method} ${url.pathname}`) {
      case "GET /.well-known/oauth-authorization-server":
        return send(200, {
          issuer: base,
          authorization_endpoint: `${base}/oauth/authorize`,
          token_endpoint: `${base}/oauth/token`,
          registration_endpoint: `${base}/oauth/register`,
        });
      case "POST /oauth/register":
        state.registered = JSON.parse(raw);
        return send(201, { ...state.registered, client_id: "client_1" });
      case "GET /oauth/authorize": {
        // Stands in for the consent page: approve at once and send the browser back.
        state.authorize = url.searchParams;
        const back = new URL(url.searchParams.get("redirect_uri") ?? "");
        back.searchParams.set("code", "code_1");
        back.searchParams.set("state", state.forgeState ?? url.searchParams.get("state") ?? "");
        back.searchParams.set("iss", base);
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      case "POST /oauth/token": {
        const form = new URLSearchParams(raw);
        if (form.get("grant_type") === "authorization_code") {
          const verifier = form.get("code_verifier") ?? "";
          const challenge = createHash("sha256").update(verifier).digest("base64url");
          const valid =
            form.get("code") === "code_1" &&
            form.get("client_id") === "client_1" &&
            form.get("redirect_uri") === state.authorize.get("redirect_uri") &&
            challenge === state.authorize.get("code_challenge");
          if (!valid) return send(400, { error: "invalid_grant", error_description: "Bad code." });
          return tokens(1, state.authorize.get("scope"));
        }
        if (form.get("refresh_token") !== state.refreshToken) {
          return send(400, { error: "invalid_grant", error_description: "Refresh token revoked." });
        }
        state.refreshes++;
        return tokens(state.refreshes + 1, "mcp:read mcp:write");
      }
      case "POST /mcp": {
        const body = JSON.parse(raw);
        state.mcp.push({ headers: req.headers, body });
        const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
        if (!state.tokens.has(token)) return send(401, { error: "Sign in." });
        const reply = (result: unknown) => send(200, { jsonrpc: "2.0", id: body.id, result });
        if (body.method === "initialize") {
          return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} } });
        }
        if (body.method === "tools/list") return reply({ tools: TOOLS });
        const { name, arguments: args } = body.params;
        const out = { received: args, approve_url: `${base}/approve/1`, confirm_token: "ct_1" };
        const result =
          name === "meta_set_budget"
            ? { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out }
            : { content: [{ type: "text", text: "Meta is not connected." }], isError: true };
        // tools/call answers as an SSE stream with a notification first, to exercise the parser.
        const note = { jsonrpc: "2.0", method: "notifications/message", params: { data: "busy" } };
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`event: message\ndata: ${JSON.stringify(note)}\n\n`);
        return res.end(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result })}\n\n`,
        );
      }
    }
    send(404, { error: "not_found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, state, close };
}
