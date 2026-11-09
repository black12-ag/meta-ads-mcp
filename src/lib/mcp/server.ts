/**
 * Builds an MCP server bound to one caller. A fresh instance is created per request (stateless
 * Streamable HTTP), so every tool runs with the caller's own userId, only the tools the caller's
 * scopes allow are registered, and every call is written to the audit log.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiScope } from "@/lib/api-scopes";
import { registerExploreTools } from "./tools/explore";
import { registerMetaTools } from "./tools/meta";
import { registerWorkspaceTools } from "./tools/workspace";

export const MCP_SERVER_NAME = "viral4all-ads-mcp";

export interface McpCaller {
  userId: string;
  /** Public origin, used to build approval links. */
  base: string;
  scopes: string[];
  apiKeyId: string | null;
  keyPrefix: string | null;
  /** Shown on approvals: "key:<prefix>" or "app:<name the app registered>". Never parsed for trust. */
  requester: string;
  /** OAuth client_id, recorded in the audit log so every call names the exact app. */
  clientId?: string | null;
  /** "api" when the REST tools endpoint runs the tool; the audit log names the surface. */
  via?: "mcp" | "api";
}

/**
 * The six workspace-note tools (list_campaigns, create_post, ...) keep local plans and drafts, not
 * Meta ads. Off while the product is Meta Ads only: an AI could mistake them for real changes.
 */
export const NOTES_TOOLS = false;

const NOTE_TOOL_SCOPES: Record<string, ApiScope> = {
  list_campaigns: "ads:read",
  list_posts: "ads:read",
  performance_summary: "ads:read",
  create_campaign: "ads:create",
  update_campaign_status: "ads:create",
  create_post: "ads:create",
};

/** Scope each tool needs. A tool missing here is never registered. */
export const TOOL_SCOPES: Record<string, ApiScope | ApiScope[]> = {
  meta_list_ads: "ads:read",
  meta_pause_ads: "ads:status",
  meta_resume_ads: "ads:status",
  meta_set_budget: "ads:budget",
  meta_update_creative: "ads:creative",
  meta_confirm_action: ["ads:status", "ads:budget", "ads:creative", "ads:edit"],
  meta_upload_media: "media:write",
  meta_create_ad: "ads:create",
  meta_sync_now: "sync:write",
  meta_get_insights: "ads:read",
  meta_list_campaigns: "ads:read",
  meta_list_accounts: "ads:read",
  meta_switch_account: "sync:write",
  meta_search_targeting: "ads:read",
  meta_list_audiences: "ads:read",
  meta_activity_log: "ads:read",
  meta_connection_status: "ads:read",
  meta_duplicate: "ads:create",
  meta_update_adset: "ads:edit",
  meta_archive: "ads:status",
  ...(NOTES_TOOLS ? NOTE_TOOL_SCOPES : {}),
};

export function canUseTool(name: string, scopes: string[]) {
  const need = TOOL_SCOPES[name];
  if (!need) return false;
  return (Array.isArray(need) ? need : [need]).some((s) => scopes.includes(s));
}

type ToolHandler = (
  ...args: unknown[]
) => Promise<{ isError?: boolean; content?: Array<{ text?: string }> }>;

function audited(caller: McpCaller, name: string, handler: ToolHandler): ToolHandler {
  return async (...args) => {
    const started = Date.now();
    const input = JSON.stringify(args.length > 1 ? args[0] : {}) ?? "{}";
    const { recordAudit } = await import("@/lib/audit.server");
    const record = (ok: boolean, error: string | null) =>
      recordAudit({
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
        keyPrefix: caller.keyPrefix,
        source: caller.via ?? "mcp",
        action: `${caller.via ?? "mcp"}.${name}`,
        ok,
        durationMs: Date.now() - started,
        detail: {
          requester: caller.requester,
          ...(caller.clientId ? { client_id: caller.clientId } : {}),
          ...(input.length <= 2000 ? { input: JSON.parse(input) } : { input_truncated: true }),
        },
        error,
      });
    try {
      const result = await handler(...args);
      await record(
        !result?.isError,
        result?.isError ? (result.content?.[0]?.text ?? "error") : null,
      );
      return result;
    } catch (err) {
      await record(false, err instanceof Error ? err.message : "error");
      throw err;
    }
  };
}

export function buildMcpServer(caller: McpCaller) {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: "1.2.0" },
    {
      instructions: [
        "Viral4All Ads runs the owner's Meta (Facebook/Instagram) ads with safety rails.",
        "Read freely: meta_list_ads, meta_list_campaigns, meta_get_insights (breakdowns, daily rows), meta_list_accounts, meta_search_targeting, meta_list_audiences, meta_activity_log, meta_connection_status.",
        "meta_pause_ads stops spend at once. meta_create_ad and meta_duplicate create PAUSED objects.",
        "meta_resume_ads, meta_set_budget, meta_update_creative, meta_update_adset and meta_archive never change anything themselves: they return a summary, an approve_url and a confirm_token. Show the user both; the change runs only when they open the link and press Approve. Then call meta_confirm_action to read the outcome. Never say a change is done before that.",
        "The owner's hard limits (highest daily budget, biggest raise, AI changes per day, protected campaigns) are enforced by the server. 'Blocked by your limits: …' means stop and tell the user; only they can change limits, at /limits.",
        "Budgets and money are in minor units (cents). If Meta isn't connected, meta_connection_status gives the link.",
        ...(NOTES_TOOLS
          ? [
              "list_campaigns, create_campaign, update_campaign_status, list_posts, create_post and performance_summary manage local workspace notes, not Meta.",
            ]
          : []),
        "You only see the tools this connection may use.",
      ].join(" "),
    },
  );
  // Register through a filter: tools outside the caller's scopes are skipped, the rest are audited.
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: unknown, handler: ToolHandler) => {
    if (!canUseTool(name, caller.scopes)) return undefined;
    return register(name, config as never, audited(caller, name, handler) as never);
  }) as unknown as typeof server.registerTool;

  registerMetaTools(server, caller);
  registerExploreTools(server, caller);
  if (NOTES_TOOLS) registerWorkspaceTools(server, caller.userId);
  return server;
}
