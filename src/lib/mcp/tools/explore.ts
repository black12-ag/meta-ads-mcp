import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpCaller } from "../server";
import { fail, ok } from "./meta";

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const ids = z.array(z.string().regex(/^\d+$/, "Meta ids are digits.")).min(1).max(50);
const accountId = z
  .string()
  .regex(/^\d+$/)
  .optional()
  .describe("Ad account id without act_. Defaults to the active account.");
const DATE_PRESETS = [
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
  "maximum",
] as const;
const BREAKDOWNS = [
  "age",
  "gender",
  "country",
  "region",
  "publisher_platform",
  "platform_position",
  "device_platform",
  "impression_device",
] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

/** Reporting, structure, accounts, targeting, audiences, history and the edits that need approval. */
export function registerExploreTools(server: McpServer, caller: McpCaller) {
  const userId = caller.userId;
  const tool = <T extends z.ZodRawShape>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: T;
      annotations?: Record<string, boolean>;
    },
    run: (input: z.objectOutputType<T, z.ZodTypeAny>) => Promise<unknown>,
  ) =>
    server.registerTool(name, config, (async (input: z.objectOutputType<T, z.ZodTypeAny>) => {
      try {
        return ok(await run(input));
      } catch (err) {
        return fail(err);
      }
    }) as never);
  const explore = () => import("@/lib/meta/explore.server");
  const confirm = () => import("../confirm.server");

  tool(
    "meta_get_insights",
    {
      title: "Meta ads report",
      description:
        "Performance report at account, campaign, ad set or ad level: spend, impressions, reach, frequency, clicks, CTR, CPC, CPM, results, cost per result, ROAS and every action count. Optional breakdowns (age, gender, country, placement, device), daily rows and id filters. Money is in minor units (cents).",
      inputSchema: {
        level: z.enum(["account", "campaign", "adset", "ad"]).default("campaign"),
        datePreset: z.enum(DATE_PRESETS).default("last_7d"),
        since: day.optional().describe("With until, a custom range instead of datePreset."),
        until: day.optional(),
        breakdowns: z.array(z.enum(BREAKDOWNS)).max(2).optional(),
        daily: z.boolean().default(false).describe("One row per day."),
        campaignIds: ids.optional(),
        adsetIds: ids.optional(),
        adIds: ids.optional(),
        accountId,
        limit: z.number().int().min(1).max(500).default(100),
      },
      annotations: READ,
    },
    async (input) => (await explore()).getInsights(userId, input),
  );

  tool(
    "meta_list_campaigns",
    {
      title: "List Meta campaigns, ad sets and ads",
      description:
        "The full structure: campaigns with their ad sets (budget, schedule, optimization goal) and ads (headline, link), each with spend, clicks, results and cost per result. Budgets and money are in minor units (cents).",
      inputSchema: {
        datePreset: z
          .enum(["today", "last_7d", "last_30d", "last_90d", "maximum"])
          .default("last_7d"),
        onlyRunning: z.boolean().default(false),
        accountId,
        limit: z.number().int().min(1).max(200).default(25).describe("Campaigns per page."),
        offset: z.number().int().min(0).default(0).describe("Skip this many campaigns (paging)."),
      },
      annotations: READ,
    },
    async (input) => (await explore()).listCampaignTree(userId, input),
  );

  tool(
    "meta_list_accounts",
    {
      title: "List connected ad accounts",
      description:
        "Every connected Meta ad account with currency, time zone and whether it can deliver, and which one the tools act on.",
      inputSchema: {},
      annotations: READ,
    },
    async () => (await explore()).listAccounts(userId, caller.base),
  );

  tool(
    "meta_switch_account",
    {
      title: "Switch the active ad account",
      description:
        "Make another connected ad account the one every tool and the dashboard act on. Spends nothing.",
      inputSchema: { accountId: z.string().regex(/^\d+$/) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ accountId }) => {
      const { activateAdAccount } = await import("@/lib/meta/store.server");
      return { active: await activateAdAccount(userId, accountId) };
    },
  );

  tool(
    "meta_search_targeting",
    {
      title: "Search Meta targeting",
      description:
        "Find interests (with audience size) or locations (countries, regions, cities) to target. Use the results with meta_update_adset or meta_create_ad.",
      inputSchema: {
        type: z.enum(["interest", "location"]),
        query: z.string().min(2).max(100),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: READ,
    },
    async (input) => (await explore()).searchTargeting(userId, input),
  );

  tool(
    "meta_list_audiences",
    {
      title: "List custom audiences",
      description:
        "Custom and lookalike audiences on the ad account with type, approximate size and whether they're ready to use.",
      inputSchema: { accountId },
      annotations: READ,
    },
    async ({ accountId }) => (await explore()).listAudiences(userId, accountId),
  );

  tool(
    "meta_activity_log",
    {
      title: "What changed recently",
      description:
        "Recent change requests (waiting, approved, rejected, failed, undone, with the owner's notes) and the ad changes the sync detected, newest first.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(30) },
      annotations: READ,
    },
    async ({ limit }) => (await explore()).activityLog(userId, caller.base, limit),
  );

  tool(
    "meta_connection_status",
    {
      title: "Meta connection status",
      description:
        "Whether Meta is connected, the active ad account, the Facebook Pages (new ads run as the active one), when the login expires and the last sync. Includes the link where the user connects or reconnects Meta, sets limits and approves changes.",
      inputSchema: {},
      annotations: READ,
    },
    async () => (await explore()).connectionStatus(userId, caller.base),
  );

  tool(
    "meta_duplicate",
    {
      title: "Duplicate a campaign, ad set or ad",
      description:
        "Make a PAUSED copy (campaigns and ad sets copy what's inside them). Spends nothing until it's resumed, which needs the owner's approval. Counts toward the owner's AI changes per day.",
      inputSchema: {
        id: z.string().regex(/^\d+$/),
        level: z.enum(["campaign", "adset", "ad"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (input) => {
      const { enforceDirect } = await confirm();
      await enforceDirect(userId, [input.id], { copy: true });
      return (await explore()).duplicate(userId, input);
    },
  );

  tool(
    "meta_update_adset",
    {
      title: "Edit an ad set's targeting, schedule or bid (needs your approval)",
      description:
        "Ask to change an ad set: countries (replace the location targeting), ages, genders, interests (from meta_search_targeting; replaces detailed targeting, [] clears it), name, end time (ISO 8601) or bid cap in minor units. Meta validates it, but nothing changes yet: returns a field-by-field summary, an approve_url and a confirm_token. Give the user both; it runs only when they approve.",
      inputSchema: {
        adsetId: z.string().regex(/^\d+$/),
        countries: z.array(z.string().length(2)).min(1).max(25).optional(),
        ageMin: z.number().int().min(13).max(65).optional(),
        ageMax: z.number().int().min(13).max(65).optional(),
        genders: z.enum(["all", "male", "female"]).optional(),
        interests: z
          .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
          .max(25)
          .optional(),
        name: z.string().min(1).max(200).optional(),
        endTime: z.string().datetime({ offset: true }).optional(),
        bidAmountMinorUnits: z.number().int().min(1).max(100_000_000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async (input) => (await confirm()).previewAdset(caller, input),
  );

  tool(
    "meta_archive",
    {
      title: "Archive campaigns, ad sets or ads (needs your approval)",
      description:
        "Ask to archive by id: they stop for good and leave the active lists. Nothing changes yet: returns a summary, an approve_url and a confirm_token. It can't be undone, so suggest meta_pause_ads when the user may want them back.",
      inputSchema: { ids },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ ids }) => (await confirm()).previewArchive(caller, ids),
  );
}
