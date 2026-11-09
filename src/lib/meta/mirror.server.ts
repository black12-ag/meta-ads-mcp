import type { MetaCampaign } from "./ads.server";
import {
  insertAdChanges,
  selectSavedAdsForDiff,
  upsertSavedAds,
  type SavedAdInput,
} from "@/lib/db/ads.server";

export interface AdChange {
  external_ad_id: string;
  ad_name: string | null;
  field: string;
  previous_value: string | null;
  new_value: string | null;
}

const TRACKED: Array<{ field: string; read: (row: Record<string, any>) => string | null }> = [
  { field: "status", read: (r) => (r.status ? String(r.status) : null) },
  { field: "spend", read: (r) => String(r.lifetime_spend_cents ?? 0) },
  { field: "results", read: (r) => String(r.lifetime_results ?? 0) },
  { field: "impressions", read: (r) => String(r.lifetime_impressions ?? 0) },
  { field: "clicks", read: (r) => String(r.lifetime_clicks ?? 0) },
  { field: "budget", read: (r) => String(r.budget_cents ?? 0) },
  { field: "creative", read: (r) => (r.image_url ? String(r.image_url) : null) },
  { field: "destination", read: (r) => (r.destination_url ? String(r.destination_url) : null) },
];

/** Persist every ad we see so it stays in the user's library forever. */
export async function mirrorAds(
  userId: string,
  accountId: string,
  pageId: string | null,
  campaigns: MetaCampaign[],
  source = "sync",
) {
  const rows: SavedAdInput[] = campaigns.flatMap((campaign) =>
    campaign.adsets.flatMap((adset) =>
      adset.ads.map((ad) => ({
        user_id: userId,
        platform: "meta",
        ad_account_id: accountId,
        page_id: pageId,
        external_ad_id: ad.id,
        external_adset_id: adset.id,
        external_campaign_id: campaign.id,
        name: ad.name,
        campaign_name: campaign.name,
        adset_name: adset.name,
        status: ad.status,
        objective: campaign.objective,
        destination_type: adset.destinationType?.toLowerCase().includes("whatsapp")
          ? "whatsapp"
          : "website",
        destination_url: ad.linkUrl,
        call_to_action: ad.callToAction ?? "LEARN_MORE",
        headline: ad.headline,
        primary_text: ad.primaryText,
        description: ad.description,
        image_url: ad.imageUrl,
        budget_kind: adset.lifetimeBudget ? "lifetime" : "daily",
        budget_cents: adset.dailyBudget ?? adset.lifetimeBudget ?? 0,
        start_time: adset.startTime,
        end_time: adset.endTime,
        lifetime_spend_cents: ad.insights.spend,
        lifetime_impressions: ad.insights.impressions,
        lifetime_clicks: ad.insights.clicks,
        lifetime_results: ad.insights.results,
        last_synced_at: new Date().toISOString(),
      })),
    ),
  );
  if (!rows.length) return { mirrored: 0, changes: 0 };

  const ids = rows.map((r) => r.external_ad_id!).filter(Boolean);
  const existing = await selectSavedAdsForDiff(userId, ids);

  const before = new Map(existing.map((r) => [r.external_ad_id, r as Record<string, any>]));
  const changes: AdChange[] = [];
  for (const row of rows) {
    const prev = before.get(row.external_ad_id);
    if (!prev) continue;
    for (const tracked of TRACKED) {
      const was = tracked.read(prev);
      const now = tracked.read(row as unknown as Record<string, any>);
      if (was !== now) {
        changes.push({
          external_ad_id: row.external_ad_id!,
          ad_name: row.name,
          field: tracked.field,
          previous_value: was,
          new_value: now,
        });
      }
    }
  }

  await upsertSavedAds(rows);

  if (changes.length) {
    await insertAdChanges(
      changes.map((c) => ({ user_id: userId, ad_account_id: accountId, source, ...c })),
    );
  }

  return { mirrored: rows.length, changes: changes.length };
}
