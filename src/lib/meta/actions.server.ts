/**
 * One place where every surface — website, MCP tools and the public REST API —
 * performs Meta ad operations, so behaviour never drifts between them.
 */
import {
  buildLink,
  createFullCampaign,
  fetchCampaignTree,
  replaceCreative,
  setBudget,
  setStatus,
  type DestinationType,
  type MetaInsights,
} from "./ads.server";
import { requireConnection } from "./store.server";
import { findAdAccount } from "@/lib/db/connections.server";
import {
  findSavedAdByExternalId,
  insertAdChanges,
  updateSavedAdCreative,
  updateSavedAdStatus,
} from "@/lib/db/ads.server";
import { lastOkSyncAt } from "@/lib/db/sync.server";

export interface FlatAd {
  adId: string;
  adName: string;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  status: string;
  effectiveStatus: string;
  running: boolean;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  currency: string;
  linkUrl: string | null;
  callToAction: string | null;
  headline: string | null;
  primaryText: string | null;
  imageUrl: string | null;
  insights: MetaInsights;
  lastSyncedAt: string | null;
}

const RUNNING = new Set(["ACTIVE", "IN_PROCESS", "PENDING_REVIEW", "PREAPPROVED"]);

/** Every ad on the active account, flattened with metrics, budget and status. */
export async function listAds(
  userId: string,
  opts: { datePreset?: string; accountId?: string } = {},
): Promise<{ accountId: string; currency: string; ads: FlatAd[]; lastSyncedAt: string | null }> {
  const conn = await requireConnection(userId);
  const accountId = opts.accountId ?? conn.active_ad_account_id;
  if (!accountId) throw new Error("No ad account selected. Choose one on the Connections page.");

  const [account, lastSyncedAt] = await Promise.all([
    findAdAccount(userId, accountId),
    lastOkSyncAt(userId),
  ]);
  const currency = account?.currency ?? "USD";

  const campaigns = await fetchCampaignTree(
    conn.access_token,
    accountId,
    opts.datePreset ?? "last_30d",
  );

  const ads: FlatAd[] = campaigns.flatMap((c) =>
    c.adsets.flatMap((s) =>
      s.ads.map((a) => ({
        adId: a.id,
        adName: a.name,
        adsetId: s.id,
        adsetName: s.name,
        campaignId: c.id,
        campaignName: c.name,
        status: a.status,
        effectiveStatus: a.effectiveStatus,
        running: RUNNING.has(a.effectiveStatus) && RUNNING.has(a.status),
        dailyBudget: s.dailyBudget ?? c.dailyBudget,
        lifetimeBudget: s.lifetimeBudget ?? c.lifetimeBudget,
        currency,
        linkUrl: a.linkUrl,
        callToAction: a.callToAction,
        headline: a.headline,
        primaryText: a.primaryText,
        imageUrl: a.imageUrl,
        insights: a.insights,
        lastSyncedAt,
      })),
    ),
  );

  return { accountId, currency, ads, lastSyncedAt };
}

/** Pause or resume one or many objects (ad, ad set or campaign ids). */
export async function setStatusBulk(
  userId: string,
  objectIds: string[],
  status: "ACTIVE" | "PAUSED",
) {
  const conn = await requireConnection(userId);
  const results: Array<{ objectId: string; ok: boolean; error?: string }> = [];

  for (const objectId of objectIds) {
    try {
      await setStatus(conn.access_token, objectId, status);
      await updateSavedAdStatus(userId, objectId, status);
      await insertAdChanges([
        {
          user_id: userId,
          ad_account_id: conn.active_ad_account_id,
          external_ad_id: objectId,
          field: "status",
          new_value: status,
          source: "action",
        },
      ]);
      results.push({ objectId, ok: true });
    } catch (err) {
      results.push({
        objectId,
        ok: false,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  return {
    status,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function setObjectBudget(
  userId: string,
  objectId: string,
  kind: "daily" | "lifetime",
  minorUnits: number,
) {
  const conn = await requireConnection(userId);
  await setBudget(conn.access_token, objectId, kind, minorUnits);
  return { ok: true as const, objectId, kind, minorUnits };
}

/** Swap the destination link and/or media of a live ad. */
export async function updateAdCreative(
  userId: string,
  params: {
    adId: string;
    destination?: DestinationType;
    destinationValue?: string;
    headline?: string;
    primaryText?: string;
    description?: string;
    callToAction?: string;
    imageUrl?: string | null;
    videoId?: string | null;
    thumbnailHash?: string | null;
    thumbnailUrl?: string | null;
  },
) {
  const conn = await requireConnection(userId);
  const saved = await findSavedAdByExternalId(userId, params.adId);

  const accountId = saved?.ad_account_id ?? conn.active_ad_account_id;
  const pageId = saved?.page_id ?? conn.active_page_id;
  if (!accountId) throw new Error("No ad account for this ad.");
  if (!pageId) throw new Error("No Facebook page selected. Pick one on the Connections page.");

  const destination = (params.destination ??
    (saved?.destination_type as DestinationType) ??
    "website") as DestinationType;
  const rawValue =
    params.destinationValue ??
    (destination === "whatsapp" ? (saved?.whatsapp_number ?? "") : (saved?.destination_url ?? ""));
  if (!rawValue) throw new Error("This ad has no destination yet — provide destinationValue.");
  const link = buildLink(destination, rawValue);

  const creativeId = await replaceCreative(conn.access_token, {
    accountId,
    adId: params.adId,
    pageId,
    name: saved?.name ?? "Updated creative",
    link,
    message: params.primaryText ?? saved?.primary_text ?? "",
    headline: params.headline ?? saved?.headline ?? saved?.name ?? "Ad",
    description: params.description ?? saved?.description ?? undefined,
    callToAction: params.callToAction ?? saved?.call_to_action ?? "LEARN_MORE",
    imageUrl: params.imageUrl ?? saved?.image_url ?? null,
    videoId: params.videoId ?? null,
    thumbnailHash: params.thumbnailHash ?? null,
    thumbnailUrl: params.thumbnailUrl ?? null,
  });

  await updateSavedAdCreative(userId, params.adId, {
    destination_type: destination,
    destination_url: link,
    whatsapp_number: destination === "whatsapp" ? rawValue : null,
    headline: params.headline ?? saved?.headline ?? null,
    primary_text: params.primaryText ?? saved?.primary_text ?? null,
    call_to_action: params.callToAction ?? saved?.call_to_action ?? "LEARN_MORE",
    image_url: params.imageUrl ?? saved?.image_url ?? null,
  });

  await insertAdChanges([
    {
      user_id: userId,
      ad_account_id: accountId,
      external_ad_id: params.adId,
      ad_name: saved?.name ?? null,
      field: "creative",
      previous_value: saved?.destination_url ?? null,
      new_value: link,
      source: "action",
    },
  ]);

  return { creativeId, link };
}

const MAX_IMPORT_BYTES = 60 * 1024 * 1024;

/** Download a hosted file and register it with Meta so an ad can use it. */
export async function importMediaFromUrl(userId: string, url: string, filename?: string) {
  const conn = await requireConnection(userId);
  const parsed = new URL(url);
  const { storeCreative } = await import("./media.server");
  // Public hosts only, re-checked on every redirect, and never more than the cap in memory.
  const { downloadPublic } = await import("@/lib/webhooks/deliver.server");
  const { status, contentType, bytes } = await downloadPublic(url, MAX_IMPORT_BYTES);
  if (status < 200 || status >= 300) throw new Error(`Could not download ${url} (HTTP ${status}).`);
  return storeCreative({
    userId,
    accountId: conn.active_ad_account_id,
    token: conn.access_token,
    filename: filename ?? parsed.pathname.split("/").pop() ?? "creative",
    contentType,
    bytes,
  });
}

export interface CreateCampaignInput {
  name: string;
  objective: "OUTCOME_TRAFFIC" | "OUTCOME_ENGAGEMENT" | "OUTCOME_AWARENESS";
  budgetKind: "daily" | "lifetime";
  budgetMinorUnits: number;
  countries: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: "all" | "male" | "female";
  destination: DestinationType;
  destinationValue: string;
  callToAction?: string;
  headline: string;
  primaryText: string;
  description?: string;
  imageUrl?: string | null;
  videoId?: string | null;
  thumbnailHash?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const conn = await requireConnection(userId);
  if (!conn.active_ad_account_id) throw new Error("No ad account selected.");
  if (!conn.active_page_id) throw new Error("No Facebook page selected.");
  const link = buildLink(input.destination, input.destinationValue);
  const created = await createFullCampaign(conn.access_token, {
    accountId: conn.active_ad_account_id,
    pageId: conn.active_page_id,
    name: input.name,
    objective: input.objective,
    budgetKind: input.budgetKind,
    budgetMinorUnits: input.budgetMinorUnits,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    countries: input.countries,
    ageMin: input.ageMin ?? 18,
    ageMax: Math.max(input.ageMax ?? 65, input.ageMin ?? 18),
    genders: input.genders ?? "all",
    link,
    callToAction: input.callToAction ?? "LEARN_MORE",
    headline: input.headline,
    primaryText: input.primaryText,
    description: input.description,
    imageUrl: input.imageUrl ?? null,
    videoId: input.videoId ?? null,
    thumbnailHash: input.thumbnailHash ?? null,
  });
  return { ...created, link };
}
