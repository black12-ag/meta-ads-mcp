import { createRequire } from "node:module";
import { LOGIN_HINT, readConfig, writeConfig } from "./config.mjs";
import { CliError } from "./errors.mjs";
import { refresh } from "./oauth.mjs";

export const PROTOCOL_VERSION = "2025-06-18";
const { version } = createRequire(import.meta.url)("../package.json");

const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** JSON-RPC messages from a JSON body or, defensively, from the data: lines of an SSE stream. */
export function parseMessages(text, contentType = "") {
  if (!contentType.includes("text/event-stream")) return [json(text)].flat();
  return text
    .split(/\r?\n\r?\n/)
    .map((event) =>
      event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
        .join("\n"),
    )
    .filter(Boolean)
    .map(json);
}

/** A tool's answer: structuredContent, else content[0].text as JSON, else that text. */
export function toolOutput(result) {
  const text = result?.content?.[0]?.text ?? "";
  if (result?.isError) throw new CliError(text || "The tool failed.", 1);
  if (result?.structuredContent) return result.structuredContent;
  return json(text) ?? text;
}

/** MCP over stateless Streamable HTTP, with the session's API key or OAuth tokens. */
export function connect(session) {
  if (!session.type) throw new CliError(`Not signed in to ${session.server}. ${LOGIN_HINT}`, 3);
  const endpoint = `${session.server}/mcp`;
  let auth = session;
  let lastId = 0;
  let initialized;

  async function renew() {
    auth = await refresh(auth).catch((err) => {
      // A parallel run may have rotated the refresh token first: use the tokens it saved.
      const saved = readConfig();
      if (saved?.server === auth.server && saved.refresh_token !== auth.refresh_token) return saved;
      throw err;
    });
    writeConfig(auth);
  }

  async function bearer() {
    if (auth.type === "key") return auth.key;
    if (Date.now() > auth.expires_at - 30_000) await renew();
    return auth.access_token;
  }

  async function rpc(method, params) {
    if (method !== "initialize") {
      await (initialized ??= rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "viral4all-ads-cli", version },
      }));
    }
    const id = ++lastId;
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          Authorization: `Bearer ${await bearer()}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      if (res.status !== 401 || auth.type !== "oauth" || attempt) break;
      await renew();
    }
    if (res.status === 401) {
      const what = auth.fromEnv ? "VIRAL4ALL_API_KEY" : auth.type === "key" ? "API key" : "sign-in";
      throw new CliError(`${session.server} did not accept your ${what}. ${LOGIN_HINT}`, 3);
    }
    const text = await res.text();
    if (!res.ok)
      throw new CliError(`${endpoint} answered HTTP ${res.status}: ${text.slice(0, 300)}`);
    const message = parseMessages(text, res.headers.get("content-type") ?? "").find(
      (m) => m?.id === id,
    );
    if (!message) throw new CliError(`Unexpected answer from ${endpoint}: ${text.slice(0, 300)}`);
    if (message.error) throw new CliError(`Server error: ${message.error.message}`);
    return message.result;
  }

  return {
    async listTools() {
      const tools = [];
      let cursor;
      do {
        const page = await rpc("tools/list", cursor ? { cursor } : {});
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      return tools;
    },
    callTool: (name, args) => rpc("tools/call", { name, arguments: args }),
  };
}
