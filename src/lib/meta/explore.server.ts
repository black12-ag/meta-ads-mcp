/**
 * What the AI tools read from Meta beyond the ad list: reports with breakdowns, the campaign tree,
 * accounts, targeting search, audiences, the change log and the connection itself. Money is in
 * minor units of the account currency everywhere, like budgets. Server-only.
 */
import { approvalHeadline, approvalStatus, requesterLabel } from "@/lib/approval-summary";
import { listAdChanges } from "@/lib/db/ads.server";
import {
  findAdAccount,
  getConnectionToken,
  listAdAccounts,
  listPages,
} from "@/lib/db/connections.server";
import { listPendingActions } from "@/lib/db/oauth.server";
import { listSyncRuns } from "@/lib/db/sync.server";
import { toMinor } from "@/lib/limits";
import type { MetaInsights } from "./ads.server";
import { graphGet, graphGetAll, graphPost } from "./graph.server";
import { getConnection, requireConnection } from "./store.server";

/** The account a tool acts on: the one asked for (it must be connected) or the active one. */
async function accountFor(userId: string, accountId?: string) {
  const conn = await requireConnection(userId);
  const id = accountId ?? conn.active_ad_account_id;
  if (!id)
    throw new Error(
      "No ad account is selected. Call meta_list_accounts, then meta_switch_account.",
    );
  const account = await findAdAccount(userId, id);
  if (!account) {
    throw new Error(
      `Ad account ${id} isn't connected. Call meta_list_accounts to see the connected ones.`,
    );
  }
  // An account can sit under another Meta login than the primary one; use that login's token.
  const token =
    account.connection_id === conn.id
      ? conn.access_token
      : await getConnectionToken(account.connection_id);
  if (!token) throw new Error("The Meta login for this ad account is gone. Reconnect Meta.");
  return { conn, account, token };
}

const accountInfo = (a: { account_id: string; name: string; currency: string }) => ({
  id: a.account_id,
  name: a.name,
  currency: a.currency,
});

const LEVEL_FIELDS = {
  account: "",
  campaign: "campaign_id,campaign_name",
  adset: "campaign_id,campaign_name,adset_id,adset_name",
  ad: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name",
};
const METRICS = "spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,purchase_roas";
/** What counts as a result, best first: the first type a row has. */
const RESULT_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "link_click",
];

export async function getInsights(
  userId: string,
  input: {
    accountId?: string;
    level: keyof typeof LEVEL_FIELDS;
    campaignIds?: string[];
    adsetIds?: string[];
    adIds?: string[];
    datePreset: string;
    since?: string;
    until?: string;
    breakdowns?: string[];
    daily?: boolean;
    limit: number;
  },
) {
  const { account, token } = await accountFor(userId, input.accountId);
  const filtering = [
    ["campaign.id", input.campaignIds],
    ["adset.id", input.adsetIds],
    ["ad.id", input.adIds],
  ]
    .filter(([, ids]) => ids?.length)
    .map(([field, value]) => ({ field, operator: "IN", value }));
  const rows = await graphGetAll<Record<string, unknown>>(
    `act_${account.account_id}/insights`,
    token,
    {
      level: input.level,
      fields: [LEVEL_FIELDS[input.level], METRICS].filter(Boolean).join(","),
      ...(input.since && input.until
        ? { time_range: JSON.stringify({ since: input.since, until: input.until }) }
        : { date_preset: input.datePreset }),
      breakdowns: input.breakdowns?.join(",") || undefined,
      time_increment: input.daily ? 1 : undefined,
      filtering: filtering.length ? JSON.stringify(filtering) : undefined,
      limit: Math.min(input.limit, 500),
    },
    Math.ceil(input.limit / 500),
  );
  const money = (v: unknown) => toMinor(Number(v ?? 0), account.currency);
  return {
    account: accountInfo(account),
    money: `spend, cpc, cpm and cost_per_result are minor units of ${account.currency} (cents).`,
    rows: rows.slice(0, input.limit).map((row) => {
      const {
        spend,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        actions,
        purchase_roas,
        ...dims
      } = row as Record<string, unknown> & {
        actions?: Array<{ action_type: string; value: string }>;
        purchase_roas?: Array<{ value: string }>;
      };
      const counts = Object.fromEntries(
        (actions ?? []).map((a) => [a.action_type, Number(a.value)]),
      );
      const resultType = RESULT_TYPES.find((t) => counts[t]) ?? null;
      const results = resultType ? counts[resultType] : 0;
      return {
        ...dims,
        spend: money(spend),
        impressions: Number(impressions ?? 0),
        reach: Number(reach ?? 0),
        frequency: Number(frequency ?? 0),
        clicks: Number(clicks ?? 0),
        ctr: Number(ctr ?? 0),
        cpc: money(cpc),
        cpm: money(cpm),
        results,
        result_type: resultType,
        cost_per_result: results ? Math.round(money(spend) / results) : null,
        roas: purchase_roas?.[0]?.value ? Number(purchase_roas[0].value) : null,
        actions: counts,
      };
    }),
    truncated: rows.length > input.limit,
  };
}

const brief = (i: MetaInsights) => ({
  spend: i.spend,
  impressions: i.impressions,
  clicks: i.clicks,
  ctr: i.ctr,
  results: i.results,
  cost_per_result: i.costPerResult || null,
});

/** Campaign → ad set → ad with budgets, schedule and numbers. Also refreshes the mirror. */
export async function listCampaignTree(
  userId: string,
  input: {
    accountId?: string;
    datePreset: string;
    onlyRunning: boolean;
    limit: number;
    offset: number;
  },
) {
  const { conn, account, token } = await accountFor(userId, input.accountId);
  const { fetchCampaignTree } = await import("./ads.server");
  const { mirrorAds } = await import("./mirror.server");
  const campaigns = await fetchCampaignTree(token, account.account_id, input.datePreset);
  // Keeps protected-campaign checks working for objects created since the last sync.
  await mirrorAds(userId, account.account_id, conn.active_page_id, campaigns);
  const live = (s: string) => !input.onlyRunning || s === "ACTIVE";
  const shown = campaigns.filter((c) => live(c.effectiveStatus));
  const page = shown.slice(input.offset, input.offset + input.limit);
  return {
    account: accountInfo(account),
    money: "Budgets, spend and cost_per_result are minor units (cents).",
    total: shown.length,
    next_offset: input.offset + page.length < shown.length ? input.offset + page.length : null,
    campaigns: page.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      delivery: c.effectiveStatus,
      objective: c.objective,
      daily_budget: c.dailyBudget,
      lifetime_budget: c.lifetimeBudget,
      ...brief(c.insights),
      adsets: c.adsets
        .filter((s) => live(s.effectiveStatus))
        .map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          delivery: s.effectiveStatus,
          daily_budget: s.dailyBudget,
          lifetime_budget: s.lifetimeBudget,
          start_time: s.startTime,
          end_time: s.endTime,
          optimization_goal: s.optimizationGoal,
          ...brief(s.insights),
          ads: s.ads
            .filter((a) => live(a.effectiveStatus))
            .map((a) => ({
              id: a.id,
              name: a.name,
              status: a.status,
              delivery: a.effectiveStatus,
              headline: a.headline,
              link: a.linkUrl,
              ...brief(a.insights),
            })),
        })),
    })),
  };
}

export async function listAccounts(userId: string, base: string) {
  const conn = await getConnection(userId);
  if (!conn) return { connected: false, accounts: [], connect_url: `${base}/connections` };
  const accounts = await listAdAccounts(userId);
  return {
    connected: true,
    active_account_id: conn.active_ad_account_id,
    accounts: accounts.map((a) => ({
      ...accountInfo(a),
      timezone: a.timezone_name,
      delivering: a.account_status === 1,
      meta_status: a.account_status,
      business: a.business_name,
      active: a.account_id === conn.active_ad_account_id,
    })),
  };
}

export async function searchTargeting(
  userId: string,
  input: { type: "interest" | "location"; query: string; limit: number },
) {
  const conn = await requireConnection(userId);
  type Row = Record<string, unknown>;
  if (input.type === "interest") {
    const res = await graphGet<{ data?: Row[] }>("search", conn.access_token, {
      type: "adinterest",
      q: input.query,
      limit: input.limit,
    });
    return {
      results: (res.data ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        audience_size: i.audience_size_upper_bound ?? null,
        path: i.path ?? [],
      })),
      use: "Pass {id, name} pairs as interests to meta_update_adset.",
    };
  }
  const res = await graphGet<{ data?: Row[] }>("search", conn.access_token, {
    type: "adgeolocation",
    q: input.query,
    location_types: JSON.stringify(["country", "region", "city"]),
    limit: input.limit,
  });
  return {
    results: (res.data ?? []).map((l) => ({
      key: l.key,
      name: l.name,
      type: l.type,
      country_code: l.country_code ?? null,
      region: l.region ?? null,
    })),
    use: "Countries go to meta_create_ad or meta_update_adset as 2-letter country_code values.",
  };
}

export async function listAudiences(userId: string, accountId?: string) {
  const { account, token } = await accountFor(userId, accountId);
  const rows = await graphGetAll<Record<string, unknown>>(
    `act_${account.account_id}/customaudiences`,
    token,
    {
      fields:
        "name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,time_updated",
    },
    3,
  );
  return {
    account: accountInfo(account),
    audiences: rows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.subtype ?? null,
      size_from: a.approximate_count_lower_bound ?? null,
      size_to: a.approximate_count_upper_bound ?? null,
      ready: (a.delivery_status as { code?: number } | undefined)?.code === 200,
      updated_at: a.time_updated ? new Date(Number(a.time_updated) * 1000).toISOString() : null,
    })),
  };
}

/** Approvals (asked, decided, undone) and the changes the sync saw, newest first. */
export async function activityLog(userId: string, base: string, limit: number) {
  const [actions, changes] = await Promise.all([
    listPendingActions(userId, limit),
    listAdChanges(userId, { limit }),
  ]);
  return {
    approvals: actions.map((r) => ({
      id: r.id,
      action: r.action,
      what: approvalHeadline(r.action, r.summary),
      status: approvalStatus(r),
      requested_by: requesterLabel(r.requested_via),
      requested_at: r.created_at,
      owner_note: r.decision_note,
      error: r.error,
      undone_at: r.undone_at,
      page: `${base}/approve/${r.id}`,
    })),
    changes: changes.map((c) => ({
      ad_id: c.external_ad_id,
      ad_name: c.ad_name,
      field: c.field,
      from: c.previous_value,
      to: c.new_value,
      source: c.source,
      at: c.created_at,
    })),
  };
}

export async function connectionStatus(userId: string, base: string) {
  const conn = await getConnection(userId);
  const links = {
    connect_url: `${base}/connections`,
    limits_url: `${base}/limits`,
    approvals_url: `${base}/approvals`,
  };
  if (!conn) {
    return {
      connected: false,
      ...links,
      next_step: "Ask the user to open connect_url, connect Meta, then try again.",
    };
  }
  const [account, runs, pages] = await Promise.all([
    conn.active_ad_account_id ? findAdAccount(userId, conn.active_ad_account_id) : null,
    listSyncRuns(userId, 1),
    listPages(userId),
  ]);
  return {
    connected: true,
    meta_user: conn.meta_name,
    login_expires_at: conn.token_expires_at,
    active_account: account && accountInfo(account),
    // New ads run as the active Page; the user picks it in Settings > Meta connection.
    pages: pages
      .filter((p) => p.connection_id === conn.id)
      .map((p) => ({
        id: p.page_id,
        name: p.name,
        category: p.category,
        instagram_id: p.instagram_business_id,
        active: p.page_id === conn.active_page_id,
      })),
    last_sync: runs[0]
      ? { status: runs[0].status, at: runs[0].created_at, error: runs[0].error_message }
      : null,
    ...links,
  };
}

/** A paused copy; campaigns and ad sets copy what's inside them. */
export async function duplicate(
  userId: string,
  input: { id: string; level: "campaign" | "adset" | "ad" },
) {
  const conn = await requireConnection(userId);
  const copied = await graphPost<Record<string, string>>(`${input.id}/copies`, conn.access_token, {
    status_option: "PAUSED",
    ...(input.level === "ad" ? {} : { deep_copy: true }),
  });
  return {
    ...copied,
    status: "PAUSED",
    next_step:
      "The copy is paused. Call meta_list_campaigns to see it; starting it needs the owner's approval (meta_resume_ads).",
  };
}
