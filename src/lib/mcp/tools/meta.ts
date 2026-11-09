import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpCaller } from "../server";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export const ok = (result: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(result) }],
  structuredContent: result as Record<string, unknown>,
});

export const fail = (err: unknown): ToolResult => ({
  content: [{ type: "text", text: err instanceof Error ? err.message : "Meta request failed." }],
  isError: true,
});

const DESTINATION = z.enum(["website", "whatsapp", "facebook_page", "messenger"]);

export function registerMetaTools(server: McpServer, caller: McpCaller) {
  const userId = caller.userId;

  server.registerTool(
    "meta_list_ads",
    {
      title: "List Meta ads",
      description:
        "List every Meta ad on the connected account with status, budget, spend, impressions, reach, interactions and destination link, plus the owner's goals and the hard limits every change request must stay inside.",
      inputSchema: {
        datePreset: z
          .enum(["today", "last_7d", "last_30d", "last_90d", "maximum"])
          .default("last_30d"),
        onlyRunning: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0).describe("Skip this many ads (paging)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ datePreset, onlyRunning, limit, offset }) => {
      try {
        const { listAds } = await import("@/lib/meta/actions.server");
        const result = await listAds(userId, { datePreset });
        const all = onlyRunning ? result.ads.filter((a) => a.running) : result.ads;
        const ads = all.slice(offset, offset + limit);
        const { getAccountSettings } = await import("@/lib/db/account-settings.server");
        const { formatMinor } = await import("@/lib/limits");
        const s = result.accountId ? await getAccountSettings(userId, result.accountId) : null;
        const m = (v: number | null) => (v == null ? null : formatMinor(v, result.currency));
        return ok({
          currency: result.currency,
          count: ads.length,
          total: all.length,
          next_offset: offset + ads.length < all.length ? offset + ads.length : null,
          lastSyncedAt: result.lastSyncedAt,
          goals_and_limits: s && {
            target_cost_per_result: m(s.target_cpr_cents),
            monthly_budget: m(s.monthly_budget_cents),
            budget_month_starts_on_day: s.cycle_start_day,
            owner_notes: s.notes,
            max_daily_budget: m(s.max_daily_budget_cents),
            max_raise_pct_per_change: s.max_raise_pct,
            max_ai_changes_per_day: s.max_changes_per_day,
            protected_ids: s.protected_ids,
            rule: "The server blocks requests outside these limits. A protected id covers everything inside it. Only the owner can change limits, on the Goals & limits page.",
          },
          ads,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_pause_ads",
    {
      title: "Pause Meta ads",
      description: "Pause one or many live Meta ads, ad sets or campaigns by id.",
      inputSchema: { ids: z.array(z.string().min(1)).min(1).max(50) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ ids }) => {
      try {
        const { enforceDirect } = await import("../confirm.server");
        await enforceDirect(userId, ids, { pause: true });
        const { setStatusBulk } = await import("@/lib/meta/actions.server");
        return ok(await setStatusBulk(userId, ids, "PAUSED"));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_resume_ads",
    {
      title: "Resume Meta ads (needs your approval)",
      description:
        "Ask to restart paused Meta ads, ad sets or campaigns by id. Nothing changes yet: returns a summary, an approve_url and a confirm_token. Give the user the summary and approve_url; the change runs only when they approve it there.",
      inputSchema: { ids: z.array(z.string().min(1)).min(1).max(50) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ ids }) => {
      try {
        const { previewResume } = await import("../confirm.server");
        return ok(await previewResume(caller, ids));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_set_budget",
    {
      title: "Change a Meta budget (needs your approval)",
      description:
        "Ask to set the daily or lifetime budget of an ad set or campaign, in minor units (cents). Meta validates it, but nothing changes yet: returns a summary (from -> to, in currency), an approve_url and a confirm_token. Give the user the summary and approve_url; the change runs only when they approve it there.",
      inputSchema: {
        objectId: z.string().min(1),
        kind: z.enum(["daily", "lifetime"]).default("daily"),
        budgetMinorUnits: z.number().int().min(100).max(100_000_000),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ objectId, kind, budgetMinorUnits }) => {
      try {
        const { previewBudget } = await import("../confirm.server");
        return ok(await previewBudget(caller, objectId, kind, budgetMinorUnits));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_update_creative",
    {
      title: "Update a Meta ad's link or creative (needs your approval)",
      description:
        "Ask to change an ad's destination (website URL or WhatsApp number), copy, call to action, image URL or video id. Nothing changes yet: returns a summary, an approve_url and a confirm_token. Give the user the summary and approve_url; the change runs only when they approve it there.",
      inputSchema: {
        adId: z.string().min(1),
        destination: DESTINATION.optional(),
        destinationValue: z.string().min(1).max(500).optional(),
        headline: z.string().min(1).max(255).optional(),
        primaryText: z.string().min(1).max(2000).optional(),
        callToAction: z.string().min(2).max(40).optional(),
        imageUrl: z.string().url().optional(),
        videoId: z.string().max(64).optional(),
        thumbnailHash: z.string().max(128).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async (input) => {
      try {
        const { previewCreative } = await import("../confirm.server");
        return ok(await previewCreative(caller, input));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_confirm_action",
    {
      title: "Check a pending Meta change",
      description:
        "Check what happened to a change prepared by meta_resume_ads, meta_set_budget, meta_update_creative, meta_update_adset or meta_archive: waiting_for_approval, done (with the result read back from Meta), undone, failed or rejected, plus any note the owner left. It never makes the change itself; only the user can, on the approve_url.",
      inputSchema: { confirm_token: z.string().min(10).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ confirm_token }) => {
      try {
        const { outcome } = await import("../confirm.server");
        return ok(await outcome(caller, confirm_token));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_upload_media",
    {
      title: "Upload media to Meta from a URL",
      description:
        "Download an image or video from a public https URL, store it, and register it with Meta so it can be used in an ad. Returns an image hash or video id.",
      inputSchema: { url: z.string().url(), filename: z.string().max(200).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ url, filename }) => {
      try {
        const { importMediaFromUrl } = await import("@/lib/meta/actions.server");
        return ok(await importMediaFromUrl(userId, url, filename));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_create_ad",
    {
      title: "Create a Meta campaign",
      description:
        "Create a full paused Meta campaign: campaign, ad set with budget and targeting, creative and ad. Resume it with meta_resume_ads when ready.",
      inputSchema: {
        name: z.string().min(2).max(200),
        objective: z
          .enum(["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS"])
          .default("OUTCOME_TRAFFIC"),
        budgetKind: z.enum(["daily", "lifetime"]).default("daily"),
        budgetMinorUnits: z.number().int().min(100).max(100_000_000),
        countries: z.array(z.string().length(2)).min(1).max(20).default(["US"]),
        destination: DESTINATION.default("website"),
        destinationValue: z.string().min(1).max(500),
        headline: z.string().min(1).max(255),
        primaryText: z.string().min(1).max(2000),
        callToAction: z.string().min(2).max(40).optional(),
        imageUrl: z.string().url().optional(),
        videoId: z.string().max(64).optional(),
        thumbnailHash: z.string().max(128).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const { createCampaign } = await import("@/lib/meta/actions.server");
        const { enforceNewCampaign } = await import("@/lib/mcp/confirm.server");
        await enforceNewCampaign(userId, input);
        return ok(await createCampaign(userId, input));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "meta_sync_now",
    {
      title: "Refresh Meta data",
      description:
        "Pull the latest spend, results and creative details from Meta and report what changed since the last sync.",
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const { syncUser } = await import("@/lib/meta/sync.server");
        return ok(await syncUser(userId, "mcp"));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
