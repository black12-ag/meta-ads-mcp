import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const ok = (result: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(result) }],
  structuredContent: result as Record<string, unknown>,
});

const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** Tools over the local workspace tables (campaigns, posts). */
export function registerWorkspaceTools(server: McpServer, userId: string) {
  server.registerTool(
    "list_campaigns",
    {
      title: "List workspace campaign notes",
      description:
        "List campaign plans saved in the Viral4All Ads workspace (local notes, not live Meta campaigns; use meta_list_campaigns for those), optionally filtered by status or platform.",
      inputSchema: {
        status: z.enum(["draft", "active", "paused", "completed"]).optional(),
        platform: z.string().optional().describe("Platform id, e.g. meta, google_ads, x, linkedin"),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, platform, limit }) => {
      const { listCampaigns } = await import("@/lib/db/workspace.server");
      const campaigns = await listCampaigns(userId, { status, platform, limit });
      return ok({ campaigns });
    },
  );

  server.registerTool(
    "create_campaign",
    {
      title: "Save a workspace campaign note",
      description:
        "Save a campaign plan in the Viral4All Ads workspace. This is a local note: nothing is created on Meta (use meta_create_ad for that).",
      inputSchema: {
        name: z.string().trim().min(1).max(120),
        platform: z.enum(["meta", "google_ads", "x", "linkedin", "tiktok"]).describe("Ad platform the campaign runs on."),
        objective: z.enum(["awareness", "traffic", "engagement", "leads", "sales"]).default("awareness"),
        budget_usd: z.number().min(0).default(0),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ name, platform, objective, budget_usd }) => {
      const { insertCampaign } = await import("@/lib/db/workspace.server");
      const campaign = await insertCampaign({
        user_id: userId,
        name,
        platform,
        objective,
        budget_cents: Math.round(budget_usd * 100),
      });
      return ok({ campaign });
    },
  );

  server.registerTool(
    "update_campaign_status",
    {
      title: "Update a workspace campaign note",
      description:
        "Change the status label of a campaign plan in the Viral4All Ads workspace. Local notes only: live Meta ads are not affected.",
      inputSchema: {
        campaign_id: z.string().uuid(),
        status: z.enum(["draft", "active", "paused", "completed"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ campaign_id, status }) => {
      const { updateCampaignStatus } = await import("@/lib/db/workspace.server");
      const campaign = await updateCampaignStatus(userId, campaign_id, status);
      return campaign ? ok({ campaign }) : fail("Campaign not found.");
    },
  );

  server.registerTool(
    "list_posts",
    {
      title: "List workspace post drafts",
      description:
        "List social post drafts saved in the Viral4All Ads workspace (local notes, nothing is published), optionally filtered by status or platform.",
      inputSchema: {
        status: z.enum(["draft", "scheduled", "published"]).optional(),
        platform: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, platform, limit }) => {
      const { listPosts } = await import("@/lib/db/workspace.server");
      return ok({ posts: await listPosts(userId, { status, platform, limit }) });
    },
  );

  server.registerTool(
    "create_post",
    {
      title: "Save a workspace post draft",
      description:
        "Save a social post draft in the Viral4All Ads workspace. Local notes only: nothing is posted anywhere.",
      inputSchema: {
        content: z.string().trim().min(1).max(5000),
        platform: z.enum(["x", "linkedin", "tiktok", "slack"]),
        scheduled_at: z.string().datetime().optional().describe("ISO 8601 time to publish. Omit to save as a draft."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ content, platform, scheduled_at }) => {
      const { insertPost } = await import("@/lib/db/workspace.server");
      const post = await insertPost({
        user_id: userId,
        content,
        platform,
        status: scheduled_at ? "scheduled" : "draft",
        scheduled_at: scheduled_at ?? null,
      });
      return ok({ post });
    },
  );

  server.registerTool(
    "performance_summary",
    {
      title: "Workspace notes summary",
      description:
        "Totals across the campaign plans saved in the Viral4All Ads workspace. For live Meta numbers use meta_get_insights.",
      inputSchema: { platform: z.string().optional().describe("Limit the summary to one platform id.") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ platform }) => {
      const { campaignSummaryRows } = await import("@/lib/db/workspace.server");
      const rows = await campaignSummaryRows(userId, platform);
      const sum = (k: "spend_cents" | "impressions" | "clicks" | "conversions") =>
        rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
      const spend = sum("spend_cents");
      const impressions = sum("impressions");
      const clicks = sum("clicks");
      const conversions = sum("conversions");
      return ok({
        campaigns: rows.length,
        active: rows.filter((r) => r.status === "active").length,
        spend_usd: spend / 100,
        impressions,
        clicks,
        conversions,
        ctr_percent: impressions ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        cpa_usd: conversions ? Number((spend / 100 / conversions).toFixed(2)) : null,
      });
    },
  );
}
