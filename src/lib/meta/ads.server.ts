import { graphGet, graphGetAll, graphPost } from "./graph.server";

const INSIGHT_FIELDS =
  "spend,impressions,reach,frequency,clicks,unique_clicks,ctr,cpc,cpm,actions,cost_per_action_type";

/** Action types that count as a "result" depending on the campaign goal. */
const RESULT_ACTIONS = [
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "purchase",
  "onsite_conversion.messaging_first_reply",
  "link_click",
];

/** Human-facing interaction buckets pulled out of Meta's `actions` array. */
export interface MetaEngagement {
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  pageEngagement: number;
  postEngagement: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews: number;
  thruplays: number;
  messagingStarted: number;
  leads: number;
  purchases: number;
}

export interface MetaInsights {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  uniqueClicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  costPerResult: number;
  engagement: MetaEngagement;
}

export const emptyInsights = (): MetaInsights => ({
  spend: 0,
  impressions: 0,
  reach: 0,
  frequency: 0,
  clicks: 0,
  uniqueClicks: 0,
  ctr: 0,
  cpc: 0,
  cpm: 0,
  results: 0,
  costPerResult: 0,
  engagement: {
    reactions: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    pageEngagement: 0,
    postEngagement: 0,
    linkClicks: 0,
    landingPageViews: 0,
    videoViews: 0,
    thruplays: 0,
    messagingStarted: 0,
    leads: 0,
    purchases: 0,
  },
});

export function normalizeInsights(raw: any): MetaInsights {
  const row = Array.isArray(raw?.data) ? raw.data[0] : raw;
  if (!row) return emptyInsights();

  const actions: any[] = row?.actions ?? [];
  const pick = (...types: string[]) =>
    actions
      .filter((a) => types.includes(a.action_type))
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0);

  const results = pick(...RESULT_ACTIONS);
  const spend = Math.round(Number(row?.spend ?? 0) * 100);

  return {
    spend,
    impressions: Number(row?.impressions ?? 0),
    reach: Number(row?.reach ?? 0),
    frequency: Number(row?.frequency ?? 0),
    clicks: Number(row?.clicks ?? 0),
    uniqueClicks: Number(row?.unique_clicks ?? 0),
    ctr: Number(row?.ctr ?? 0),
    cpc: Math.round(Number(row?.cpc ?? 0) * 100),
    cpm: Math.round(Number(row?.cpm ?? 0) * 100),
    results,
    costPerResult: results > 0 ? Math.round(spend / results) : 0,
    engagement: {
      reactions: pick("post_reaction", "like"),
      comments: pick("comment"),
      shares: pick("post"),
      saves: pick("onsite_conversion.post_save"),
      pageEngagement: pick("page_engagement"),
      postEngagement: pick("post_engagement"),
      linkClicks: pick("link_click"),
      landingPageViews: pick("landing_page_view"),
      videoViews: pick("video_view"),
      thruplays: pick("video_thruplay_watched_actions", "thruplay"),
      messagingStarted: pick(
        "onsite_conversion.messaging_conversation_started_7d",
        "onsite_conversion.messaging_first_reply",
      ),
      leads: pick("lead", "onsite_conversion.lead_grouped"),
      purchases: pick("purchase", "offsite_conversion.fb_pixel_purchase"),
    },
  };
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  creativeId: string | null;
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  callToAction: string | null;
  insights: MetaInsights;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  endTime: string | null;
  destinationType: string | null;
  optimizationGoal: string | null;
  insights: MetaInsights;
  ads: MetaAd[];
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  createdTime: string | null;
  insights: MetaInsights;
  adsets: MetaAdSet[];
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
// Meta sends "0" for the budget kind an object doesn't use (a daily ad set has lifetime_budget "0").
export const budget = (v: unknown) => num(v) || null;

function pickCreative(creative: any) {
  const spec = creative?.object_story_spec ?? {};
  const link = spec.link_data ?? spec.video_data ?? {};
  return {
    creativeId: creative?.id ?? null,
    headline: link.name ?? creative?.title ?? null,
    primaryText: link.message ?? creative?.body ?? null,
    description: link.description ?? null,
    imageUrl: creative?.thumbnail_url ?? link.picture ?? creative?.image_url ?? null,
    linkUrl: link.link ?? creative?.link_url ?? creative?.object_url ?? null,
    callToAction: link.call_to_action?.type ?? null,
  };
}

/** Shape the Graph API returns for each level; assembled into the tree below. */
type RawCampaign = Record<string, any>;
type RawAdSet = Record<string, any>;
type RawAd = Record<string, any>;

const CAMPAIGN_FIELDS =
  "name,status,effective_status,objective,daily_budget,lifetime_budget,created_time";
const ADSET_FIELDS =
  "name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,destination_type,optimization_goal,campaign_id";
const AD_FIELDS =
  "name,status,effective_status,adset_id,campaign_id,creative{id,title,body,image_url,thumbnail_url,link_url,object_story_spec}";

/**
 * Build the campaign tree from three flat, fully paginated lists.
 *
 * Fetching nested edges (campaigns{adsets{ads}}) caps each level at one page, so accounts with
 * more than a page of ads silently under-report. Three flat queries paginate cleanly and cost the
 * same number of round trips regardless of account size.
 */
export function assembleCampaignTree(
  campaigns: RawCampaign[],
  adsets: RawAdSet[],
  ads: RawAd[],
): MetaCampaign[] {
  const adsByAdSet = new Map<string, MetaAd[]>();
  for (const a of ads) {
    const key = String(a.adset_id ?? "");
    const list = adsByAdSet.get(key) ?? [];
    list.push({
      id: a.id,
      name: a.name,
      status: a.status,
      effectiveStatus: a.effective_status ?? a.status,
      insights: normalizeInsights(a.insights),
      ...pickCreative(a.creative),
    });
    adsByAdSet.set(key, list);
  }

  const adsetsByCampaign = new Map<string, MetaAdSet[]>();
  for (const s of adsets) {
    const key = String(s.campaign_id ?? "");
    const list = adsetsByCampaign.get(key) ?? [];
    list.push({
      id: s.id,
      name: s.name,
      status: s.status,
      effectiveStatus: s.effective_status ?? s.status,
      dailyBudget: budget(s.daily_budget),
      lifetimeBudget: budget(s.lifetime_budget),
      startTime: s.start_time ?? null,
      endTime: s.end_time ?? null,
      destinationType: s.destination_type ?? null,
      optimizationGoal: s.optimization_goal ?? null,
      insights: normalizeInsights(s.insights),
      ads: adsByAdSet.get(String(s.id)) ?? [],
    });
    adsetsByCampaign.set(key, list);
  }

  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    effectiveStatus: c.effective_status ?? c.status,
    objective: c.objective ?? null,
    dailyBudget: budget(c.daily_budget),
    lifetimeBudget: budget(c.lifetime_budget),
    createdTime: c.created_time ?? null,
    insights: normalizeInsights(c.insights),
    adsets: adsetsByCampaign.get(String(c.id)) ?? [],
  }));
}

export async function fetchCampaignTree(
  token: string,
  accountId: string,
  datePreset = "last_30d",
): Promise<MetaCampaign[]> {
  const insights = `insights.date_preset(${datePreset}){${INSIGHT_FIELDS}}`;
  const acct = `act_${accountId}`;

  const [campaigns, adsets, ads] = await Promise.all([
    graphGetAll<RawCampaign>(`${acct}/campaigns`, token, {
      fields: `${CAMPAIGN_FIELDS},${insights}`,
    }),
    graphGetAll<RawAdSet>(`${acct}/adsets`, token, { fields: `${ADSET_FIELDS},${insights}` }),
    graphGetAll<RawAd>(`${acct}/ads`, token, { fields: `${AD_FIELDS},${insights}` }),
  ]);

  return assembleCampaignTree(campaigns, adsets, ads);
}

export const setStatus = (token: string, objectId: string, status: "ACTIVE" | "PAUSED") =>
  graphPost(objectId, token, { status });

export const setBudget = (
  token: string,
  objectId: string,
  kind: "daily" | "lifetime",
  minorUnits: number,
) =>
  graphPost(
    objectId,
    token,
    kind === "daily" ? { daily_budget: minorUnits } : { lifetime_budget: minorUnits },
  );

export const setSchedule = (
  token: string,
  adsetId: string,
  startTime: string | null,
  endTime: string | null,
) =>
  graphPost(adsetId, token, { start_time: startTime ?? undefined, end_time: endTime ?? undefined });

export type DestinationType = "website" | "whatsapp" | "facebook_page" | "messenger";

export function buildLink(destination: DestinationType, value: string) {
  if (destination === "whatsapp") {
    const digits = value.replace(/[^\d]/g, "");
    return `https://api.whatsapp.com/send?phone=${digits}`;
  }
  if (destination === "messenger")
    return `https://m.me/${value.replace(/^https?:\/\/m\.me\//, "")}`;
  if (destination === "facebook_page") {
    return value.startsWith("http") ? value : `https://www.facebook.com/${value}`;
  }
  return value;
}

export interface CreativeContent {
  pageId: string;
  link: string;
  message: string;
  headline: string;
  description?: string;
  callToAction: string;
  /** Hosted image url (or Meta CDN url) for image ads. */
  imageUrl?: string | null;
  /** Meta ad image hash; wins over imageUrl, so the exact uploaded image runs. */
  imageHash?: string | null;
  /** Meta ad video id — when present a video creative is built instead. */
  videoId?: string | null;
  /** Image hash of the video thumbnail. Required by Meta for video creatives. */
  thumbnailHash?: string | null;
  thumbnailUrl?: string | null;
}

/** Build the object_story_spec for either an image or a video creative. */
export function buildStorySpec(c: CreativeContent) {
  const cta = { type: c.callToAction, value: { link: c.link } };
  if (c.videoId) {
    return {
      page_id: c.pageId,
      video_data: {
        video_id: c.videoId,
        message: c.message,
        title: c.headline,
        link_description: c.description || undefined,
        image_hash: c.thumbnailHash || undefined,
        image_url: c.thumbnailHash ? undefined : c.thumbnailUrl || undefined,
        call_to_action: cta,
      },
    };
  }
  return {
    page_id: c.pageId,
    link_data: {
      link: c.link,
      message: c.message,
      name: c.headline,
      description: c.description || undefined,
      image_hash: c.imageHash || undefined,
      picture: c.imageHash ? undefined : c.imageUrl || undefined,
      call_to_action: cta,
    },
  };
}

const NO_ENHANCEMENTS = {
  creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } },
};

/** Creatives are immutable on Meta — build a new one and point the ad at it. */
export async function replaceCreative(
  token: string,
  params: CreativeContent & { accountId: string; adId: string; name: string },
) {
  const creative = await graphPost<{ id: string }>(`act_${params.accountId}/adcreatives`, token, {
    name: `${params.name} — ${new Date().toISOString().slice(0, 16)}`,
    object_story_spec: buildStorySpec(params),
    degrees_of_freedom_spec: NO_ENHANCEMENTS,
  });
  await graphPost(params.adId, token, { creative: { creative_id: creative.id } });
  return creative.id;
}

/** Duplicate a whole campaign (paused) so a saved ad can be run again. */
export async function copyCampaign(token: string, campaignId: string) {
  return graphPost<{ copied_campaign_id: string }>(`${campaignId}/copies`, token, {
    deep_copy: true,
    status_option: "PAUSED",
  });
}

export interface NewCampaignInput {
  accountId: string;
  pageId: string;
  name: string;
  objective: "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_AWARENESS";
  budgetKind: "daily" | "lifetime";
  budgetMinorUnits: number;
  startTime: string | null;
  endTime: string | null;
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders: "all" | "male" | "female";
  link: string;
  callToAction: string;
  headline: string;
  primaryText: string;
  description?: string;
  imageUrl?: string | null;
  imageHash?: string | null;
  videoId?: string | null;
  thumbnailHash?: string | null;
  thumbnailUrl?: string | null;
}

const OPTIMIZATION: Record<NewCampaignInput["objective"], string> = {
  OUTCOME_TRAFFIC: "LINK_CLICKS",
  OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
  OUTCOME_AWARENESS: "REACH",
};

/** Create campaign → ad set → creative → ad in one go. Everything starts PAUSED. */
export async function createFullCampaign(token: string, input: NewCampaignInput) {
  const acct = `act_${input.accountId}`;

  const campaign = await graphPost<{ id: string }>(`${acct}/campaigns`, token, {
    name: input.name,
    objective: input.objective,
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
  });

  const adset = await graphPost<{ id: string }>(`${acct}/adsets`, token, {
    name: `${input.name} — ad set`,
    campaign_id: campaign.id,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: OPTIMIZATION[input.objective],
    [input.budgetKind === "daily" ? "daily_budget" : "lifetime_budget"]: input.budgetMinorUnits,
    start_time: input.startTime ?? undefined,
    end_time:
      input.budgetKind === "lifetime" && !input.endTime
        ? new Date(Date.now() + 30 * 86_400_000).toISOString()
        : (input.endTime ?? undefined),
    targeting: {
      geo_locations: { countries: input.countries },
      age_min: input.ageMin,
      age_max: input.ageMax,
      genders: input.genders === "all" ? undefined : input.genders === "male" ? [1] : [2],
    },
  });

  const creative = await graphPost<{ id: string }>(`${acct}/adcreatives`, token, {
    name: `${input.name} — creative`,
    object_story_spec: buildStorySpec({
      pageId: input.pageId,
      link: input.link,
      message: input.primaryText,
      headline: input.headline,
      description: input.description,
      callToAction: input.callToAction,
      imageUrl: input.imageUrl,
      imageHash: input.imageHash,
      videoId: input.videoId,
      thumbnailHash: input.thumbnailHash,
      thumbnailUrl: input.thumbnailUrl,
    }),
    degrees_of_freedom_spec: NO_ENHANCEMENTS,
  });

  const ad = await graphPost<{ id: string }>(`${acct}/ads`, token, {
    name: `${input.name} — ad`,
    adset_id: adset.id,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  return { campaignId: campaign.id, adsetId: adset.id, creativeId: creative.id, adId: ad.id };
}
