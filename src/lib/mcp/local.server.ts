/**
 * Runs the MCP tools in-process, so the REST tools endpoint, the OpenAPI file and llms.txt list and
 * run exactly what MCP clients get: same tools, scope filter, validation, approvals and audit.
 * Server-only.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ALL_SCOPES } from "@/lib/api-scopes";
import { json } from "@/lib/api-keys.server";
import { resolveCaller } from "./handler.server";
import { buildMcpServer, canUseTool, TOOL_SCOPES, type McpCaller } from "./server";

async function withClient<T>(caller: McpCaller, fn: (client: Client) => Promise<T>) {
  const server = buildMcpServer(caller);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "viral4all-rest", version: "1.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

export const listTools = (caller: McpCaller) =>
  withClient(caller, async (client) => (await client.listTools()).tools);

export const callTool = (caller: McpCaller, name: string, args: Record<string, unknown>) =>
  withClient(caller, (client) => client.callTool({ name, arguments: args }));

let catalog: ReturnType<typeof listTools> | null = null;
/** Every tool a connection with all scopes gets. Listing never runs a tool. */
export function toolCatalog() {
  catalog ??= listTools({
    userId: "_catalog",
    base: "",
    scopes: ALL_SCOPES,
    apiKeyId: null,
    keyPrefix: null,
    requester: "catalog",
  });
  return catalog;
}

const UNAUTHORIZED = {
  error: "Send Authorization: Bearer sk_meta_<API key> or an OAuth access token.",
};
const scopeOf = (name: string) => [TOOL_SCOPES[name]].flat().join(" or ");

/** GET /api/public/v1/tools: what this key or app may run, with input schemas. */
export async function listToolsRequest(request: Request) {
  const caller = await resolveCaller(request);
  if (!caller) return json(UNAUTHORIZED, 401);
  const tools = await listTools(caller);
  return json({
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title ?? null,
      description: t.description ?? null,
      scope: scopeOf(t.name),
      input_schema: t.inputSchema,
    })),
    run: `POST ${caller.base}/api/public/v1/tools/{name} with a JSON body`,
    openapi: `${caller.base}/api/public/v1/openapi.json`,
  });
}

/** POST /api/public/v1/tools/{name}: run one tool with the JSON body as its input. */
export async function runToolRequest(request: Request, name: string) {
  const caller = await resolveCaller(request);
  if (!caller) return json(UNAUTHORIZED, 401);
  if (!(name in TOOL_SCOPES)) {
    return json({ error: `Unknown tool "${name}". GET /api/public/v1/tools lists them.` }, 404);
  }
  if (!canUseTool(name, caller.scopes)) {
    return json(
      { error: `This key can't use ${name}: it needs the ${scopeOf(name)} permission.` },
      403,
    );
  }
  const text = await request.text();
  if (text.length > 1_000_000) return json({ error: "The body is too large." }, 413);
  let args: unknown;
  try {
    args = text.trim() ? JSON.parse(text) : {};
  } catch {
    return json({ error: "The body must be JSON." }, 400);
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return json({ error: "The body must be a JSON object of the tool's inputs." }, 400);
  }
  try {
    const result = await callTool({ ...caller, via: "api" }, name, args as Record<string, unknown>);
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const out = content.find((c) => c.type === "text")?.text;
    if (result.isError) return json({ error: out ?? "The tool failed." }, 400);
    if (result.structuredContent) return json(result.structuredContent);
    try {
      return json(JSON.parse(out ?? "{}"));
    } catch {
      return json({ text: out });
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "The tool failed." }, 400);
  }
}

const clip = (s: string | undefined, n: number) =>
  !s ? "" : s.length > n ? `${s.slice(0, n - 1)}…` : s;
const ERROR = {
  description: "Error",
  content: {
    "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } },
  },
};

/** OpenAPI 3.1 for the tools endpoint, generated from the tool catalog (GPT Actions, Zapier, n8n). */
export async function openApiDocument(base: string) {
  const tools = await toolCatalog();
  const paths: Record<string, unknown> = {
    "/api/public/v1/tools": {
      get: {
        operationId: "listTools",
        summary: "List the tools this key can use",
        responses: { "200": { description: "Tools with their input schemas" }, "401": ERROR },
      },
    },
  };
  for (const t of tools) {
    const { $schema: _drop, ...schema } = t.inputSchema as Record<string, unknown>;
    paths[`/api/public/v1/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: clip(t.title ?? t.name, 100),
        // GPT Actions reject operation descriptions over 300 characters.
        description: clip(t.description, 300),
        "x-required-scope": scopeOf(t.name),
        requestBody: { required: true, content: { "application/json": { schema } } },
        responses: {
          "200": {
            description: "The tool's result",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "400": ERROR,
          "401": ERROR,
          "403": ERROR,
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Viral4All Ads API",
      version: "1.2.0",
      description:
        "Run your Meta ads from any AI or automation. Every MCP tool is POST /api/public/v1/tools/{name}. Changes that spend money return an approve_url: nothing changes until the owner approves it. The owner's limits are enforced on the server.",
    },
    servers: [{ url: base }],
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: "An API key (sk_meta_…) from the API keys page, or an OAuth access token.",
        },
      },
    },
    security: [{ bearer: [] }],
    paths,
  };
}

/** /llms.txt: how an AI agent connects and what it may do, from the same catalog. */
export async function llmsText(base: string) {
  const tools = await toolCatalog();
  const first = (s?: string) => (s ?? "").split(/(?<=\.)\s/)[0];
  return [
    "# Viral4All Ads",
    "",
    "> A Meta (Facebook and Instagram) ads control room an AI can use safely. It reads performance, pauses waste at once, and asks the owner to approve anything that spends money. The owner's hard limits are enforced on the server.",
    "",
    "## Connect",
    `- MCP (Streamable HTTP): ${base}/mcp. Sign in with OAuth (discovery: ${base}/.well-known/oauth-authorization-server) or send \`Authorization: Bearer sk_meta_…\` (an API key from ${base}/api-keys).`,
    `- REST: \`GET ${base}/api/public/v1/tools\`, then \`POST ${base}/api/public/v1/tools/{name}\` with a JSON body. Same tools and rules as MCP. OpenAPI: ${base}/api/public/v1/openapi.json`,
    "- CLI (npm): `npx -y viral4all-ads login`, then `npx -y viral4all-ads tools`.",
    `- Claude Code plugin: \`/plugin marketplace add ${base}/claude/marketplace.json\`, then \`/plugin install viral4all-ads@viral4all\`.`,
    `- Docs (everything in one place): ${base}/docs`,
    `- Steps for every AI app: ${base}/connect`,
    "",
    "## Rules for agents",
    "- Changes that spend money or publish return `approve_url` and `confirm_token`. Show the user the summary and the approve_url; nothing changes until they approve. Then call `meta_confirm_action`. Never say a change ran before that.",
    "- `meta_pause_ads` runs at once. New campaigns and copies start paused.",
    '- "Blocked by your limits: …" comes from the owner\'s limits. Stop and tell the user; only they can change limits.',
    "- Budgets and money are in minor units (cents).",
    "",
    "## Tools",
    ...tools.map((t) => `- \`${t.name}\`: ${t.title ?? t.name}. ${first(t.description)}`),
    "",
    "## Pages for the owner",
    `- Approvals: ${base}/approvals`,
    `- Goals & limits: ${base}/limits`,
    `- Privacy: ${base}/privacy`,
    `- Terms: ${base}/terms`,
    "",
  ].join("\n");
}

/** The MCP Registry's domain proof ("v=MCPv1; k=ed25519; p=…"), or null until it's configured. */
export const registryProof = () => process.env.MCP_REGISTRY_AUTH?.trim() || null;

/** The token OpenAI's plugin review asks us to serve to prove the domain, or null until set. */
export const openAiChallenge = () => process.env.OPENAI_APPS_CHALLENGE?.trim() || null;
