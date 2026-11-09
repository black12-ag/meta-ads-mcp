/**
 * Account-level rollups built from the same live Meta data the control room
 * uses, so Overview / Analytics / Campaigns never drift from what Meta reports.
 */
import { listAds } from "./actions.server";
import { listAdChangeSeries } from "@/lib/db/ads.server";

export interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  linkClicks: number;
  engagement: number;
  leads: number;
  purchases: number;
  videoViews: number;
  messagingStarted: number;
  ctr: number;
  cpc: number;
  cpm: number;
  costPerResult: number;
}

export interface CampaignRollup extends Totals {
  campaignId: string;
  campaignName: string;
  ads: number;
  running: number;
  dailyBudget: number;
  lifetimeBudget: number;
}

const ratios = (t: Totals): Totals => ({
  ...t,
  ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
  cpc: t.clicks ? t.spend / t.clicks : 0,
  cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
  costPerResult: t.results ? t.spend / t.results : 0,
});

const zero = (): Totals => ({
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  results: 0,
  linkClicks: 0,
  engagement: 0,
  leads: 0,
  purchases: 0,
  videoViews: 0,
  messagingStarted: 0,
  ctr: 0,
  cpc: 0,
  cpm: 0,
  costPerResult: 0,
});

export async function adsOverview(
  userId: string,
  opts: { datePreset?: string; accountId?: string } = {},
) {
  const { accountId, currency, ads, lastSyncedAt } = await listAds(userId, opts);

  const totals = zero();
  const byCampaign = new Map<string, CampaignRollup>();

  for (const ad of ads) {
    const i = ad.insights;
    const add = (t: Totals) => {
      t.spend += i.spend;
      t.impressions += i.impressions;
      t.reach += i.reach;
      t.clicks += i.clicks;
      t.results += i.results;
      t.linkClicks += i.engagement.linkClicks;
      t.engagement += i.engagement.postEngagement + i.engagement.pageEngagement;
      t.leads += i.engagement.leads;
      t.purchases += i.engagement.purchases;
      t.videoViews += i.engagement.videoViews;
      t.messagingStarted += i.engagement.messagingStarted;
    };
    add(totals);

    let row = byCampaign.get(ad.campaignId);
    if (!row) {
      row = {
        ...zero(),
        campaignId: ad.campaignId,
        campaignName: ad.campaignName,
        ads: 0,
        running: 0,
        dailyBudget: 0,
        lifetimeBudget: 0,
      };
      byCampaign.set(ad.campaignId, row);
    }
    add(row);
    row.ads += 1;
    if (ad.running) row.running += 1;
    row.dailyBudget += ad.dailyBudget ?? 0;
    row.lifetimeBudget += ad.lifetimeBudget ?? 0;
  }

  const campaigns = [...byCampaign.values()]
    .map((c) => ({ ...c, ...ratios(c) }))
    .sort((a, b) => b.spend - a.spend);

  return {
    connected: true as const,
    accountId,
    currency,
    lastSyncedAt,
    adCount: ads.length,
    runningCount: ads.filter((a) => a.running).length,
    campaignCount: campaigns.length,
    dailyBudget: campaigns.reduce((a, c) => a + c.dailyBudget, 0),
    totals: ratios(totals),
    campaigns,
    ads: ads.map((a) => ({
      adId: a.adId,
      adName: a.adName,
      campaignId: a.campaignId,
      campaignName: a.campaignName,
      status: a.status,
      running: a.running,
      spend: a.insights.spend,
      impressions: a.insights.impressions,
      clicks: a.insights.clicks,
      results: a.insights.results,
      imageUrl: a.imageUrl,
    })),
  };
}

/** Daily account-wide series replayed from the sync change log. */
export async function accountTimeline(userId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const data = await listAdChangeSeries(
    userId,
    ["spend", "impressions", "clicks", "results"],
    since,
    5000,
  );

  // Latest cumulative value per ad per day, summed across ads.
  const perDay = new Map<string, Map<string, Record<string, number>>>();
  for (const row of data) {
    const day = String(row.created_at).slice(0, 10);
    const value = Number(row.new_value);
    if (!Number.isFinite(value)) continue;
    const ads = perDay.get(day) ?? new Map<string, Record<string, number>>();
    const ad = ads.get(row.external_ad_id) ?? {};
    ad[row.field] = value;
    ads.set(row.external_ad_id, ad);
    perDay.set(day, ads);
  }

  const carried = new Map<string, Record<string, number>>();
  return [...perDay.keys()].sort().map((day) => {
    for (const [adId, metrics] of perDay.get(day)!) {
      carried.set(adId, { ...(carried.get(adId) ?? {}), ...metrics });
    }
    const point = { day, spend: 0, impressions: 0, clicks: 0, results: 0 };
    for (const metrics of carried.values()) {
      point.spend += metrics.spend ?? 0;
      point.impressions += metrics.impressions ?? 0;
      point.clicks += metrics.clicks ?? 0;
      point.results += metrics.results ?? 0;
    }
    return point;
  });
}
