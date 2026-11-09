/** saved_ads and meta_ad_changes. Server-only. */
import { maybeOne, q, values } from "./pool.server";

export interface SavedAdRow {
  id: string;
  user_id: string;
  platform: string;
  ad_account_id: string | null;
  page_id: string | null;
  external_ad_id: string | null;
  external_adset_id: string | null;
  external_campaign_id: string | null;
  name: string;
  campaign_name: string | null;
  adset_name: string | null;
  status: string;
  objective: string | null;
  destination_type: string;
  destination_url: string | null;
  whatsapp_number: string | null;
  call_to_action: string;
  headline: string | null;
  primary_text: string | null;
  description: string | null;
  image_url: string | null;
  budget_kind: string;
  budget_cents: number;
  currency: string;
  start_time: string | null;
  end_time: string | null;
  lifetime_spend_cents: number;
  lifetime_impressions: number;
  lifetime_clicks: number;
  lifetime_results: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns a caller may write. Anything else is ignored, so column names never come from input. */
const WRITABLE = [
  "user_id",
  "platform",
  "ad_account_id",
  "page_id",
  "external_ad_id",
  "external_adset_id",
  "external_campaign_id",
  "name",
  "campaign_name",
  "adset_name",
  "status",
  "objective",
  "destination_type",
  "destination_url",
  "whatsapp_number",
  "call_to_action",
  "headline",
  "primary_text",
  "description",
  "image_url",
  "budget_kind",
  "budget_cents",
  "currency",
  "start_time",
  "end_time",
  "lifetime_spend_cents",
  "lifetime_impressions",
  "lifetime_clicks",
  "lifetime_results",
  "last_synced_at",
] as const;
type Writable = (typeof WRITABLE)[number];

export type SavedAdInput = Partial<Pick<SavedAdRow, Writable>> &
  Pick<SavedAdRow, "user_id" | "external_ad_id" | "name">;

/** Insert or update by (user_id, external_ad_id). Every row must carry the same set of keys. */
export async function upsertSavedAds(rows: SavedAdInput[]) {
  if (!rows.length) return;
  const cols = WRITABLE.filter((c) => c in rows[0]);
  const { text, params } = values(
    rows.map((r) => cols.map((c) => (r as Record<string, unknown>)[c] ?? null)),
  );
  const updates = cols
    .filter((c) => c !== "user_id" && c !== "external_ad_id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await q(
    `INSERT INTO saved_ads (${cols.join(", ")}) VALUES ${text}
     ON CONFLICT (user_id, external_ad_id) WHERE external_ad_id IS NOT NULL
     DO UPDATE SET ${updates}`,
    params,
  );
}

export const upsertSavedAd = (row: SavedAdInput) => upsertSavedAds([row]);

export type SavedAdDiffRow = Pick<
  SavedAdRow,
  | "external_ad_id"
  | "status"
  | "lifetime_spend_cents"
  | "lifetime_results"
  | "lifetime_impressions"
  | "lifetime_clicks"
  | "budget_cents"
  | "image_url"
  | "destination_url"
>;

export async function selectSavedAdsForDiff(userId: string, externalIds: string[]) {
  if (!externalIds.length) return [];
  return q<SavedAdDiffRow>(
    `SELECT external_ad_id, status, lifetime_spend_cents, lifetime_results, lifetime_impressions,
            lifetime_clicks, budget_cents, image_url, destination_url
     FROM saved_ads WHERE user_id = $1 AND external_ad_id = ANY($2)`,
    [userId, externalIds],
  );
}

export async function updateSavedAdStatus(userId: string, externalAdId: string, status: string) {
  await q(`UPDATE saved_ads SET status = $3 WHERE user_id = $1 AND external_ad_id = $2`, [
    userId,
    externalAdId,
    status,
  ]);
}

const CREATIVE_FIELDS = [
  "destination_type",
  "destination_url",
  "whatsapp_number",
  "headline",
  "primary_text",
  "description",
  "call_to_action",
  "image_url",
] as const;

export async function updateSavedAdCreative(
  userId: string,
  externalAdId: string,
  patch: Partial<Pick<SavedAdRow, (typeof CREATIVE_FIELDS)[number]>>,
) {
  const sets: string[] = [];
  const params: unknown[] = [userId, externalAdId];
  for (const key of CREATIVE_FIELDS) {
    if (key in patch) {
      params.push(patch[key] ?? null);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return;
  await q(
    `UPDATE saved_ads SET ${sets.join(", ")} WHERE user_id = $1 AND external_ad_id = $2`,
    params,
  );
}

export async function findSavedAdByExternalId(userId: string, externalAdId: string) {
  return maybeOne<SavedAdRow>(
    `SELECT * FROM saved_ads WHERE user_id = $1 AND external_ad_id = $2`,
    [userId, externalAdId],
  );
}

export async function listSavedAds(userId: string, limit = 300) {
  return q<SavedAdRow>(
    `SELECT * FROM saved_ads WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function getSavedAdById(userId: string, id: string) {
  return maybeOne<SavedAdRow>(`SELECT * FROM saved_ads WHERE user_id = $1 AND id = $2`, [
    userId,
    id,
  ]);
}

export async function deleteSavedAdsByUser(userId: string) {
  await q(`DELETE FROM saved_ads WHERE user_id = $1`, [userId]);
}

// ---- change log ----

export interface AdChangeInput {
  user_id: string;
  ad_account_id: string | null;
  external_ad_id: string;
  ad_name?: string | null;
  field: string;
  previous_value?: string | null;
  new_value: string | null;
  source: string;
}

export interface AdChangeRow extends Required<AdChangeInput> {
  id: string;
  created_at: string;
}

export async function insertAdChanges(rows: AdChangeInput[]) {
  if (!rows.length) return;
  const { text, params } = values(
    rows.map((c) => [
      c.user_id,
      c.ad_account_id,
      c.external_ad_id,
      c.ad_name ?? null,
      c.field,
      c.previous_value ?? null,
      c.new_value,
      c.source,
    ]),
  );
  await q(
    `INSERT INTO meta_ad_changes
       (user_id, ad_account_id, external_ad_id, ad_name, field, previous_value, new_value, source)
     VALUES ${text}`,
    params,
  );
}

export async function listAdChanges(userId: string, opts: { adId?: string; limit: number }) {
  const params: unknown[] = [userId];
  let where = "user_id = $1";
  if (opts.adId) {
    params.push(opts.adId);
    where += ` AND external_ad_id = $${params.length}`;
  }
  params.push(opts.limit);
  return q<AdChangeRow>(
    `SELECT * FROM meta_ad_changes WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
}

export type AdChangePoint = Pick<
  AdChangeRow,
  "external_ad_id" | "field" | "new_value" | "created_at"
>;

/** Oldest-first series of tracked numbers, for the timeline charts. */
export async function listAdChangeSeries(
  userId: string,
  fields: string[],
  since: string,
  limit: number,
  adId?: string,
) {
  const params: unknown[] = [userId, fields, since];
  let where = "user_id = $1 AND field = ANY($2) AND created_at >= $3";
  if (adId) {
    params.push(adId);
    where += ` AND external_ad_id = $${params.length}`;
  }
  params.push(limit);
  return q<AdChangePoint>(
    `SELECT external_ad_id, field, new_value, created_at FROM meta_ad_changes
     WHERE ${where} ORDER BY created_at ASC LIMIT $${params.length}`,
    params,
  );
}

export async function deleteAdChangesByUser(userId: string) {
  await q(`DELETE FROM meta_ad_changes WHERE user_id = $1`, [userId]);
}

/** Remove mirrored ads that belong to specific ad accounts (used when one Meta login is revoked). */
export async function deleteSavedAdsByAccounts(userId: string, accountIds: string[]) {
  if (!accountIds.length) return;
  await q(`DELETE FROM saved_ads WHERE user_id = $1 AND ad_account_id = ANY($2)`, [
    userId,
    accountIds,
  ]);
}

export async function deleteAdChangesByAccounts(userId: string, accountIds: string[]) {
  if (!accountIds.length) return;
  await q(`DELETE FROM meta_ad_changes WHERE user_id = $1 AND ad_account_id = ANY($2)`, [
    userId,
    accountIds,
  ]);
}

/**
 * Each id plus its parents (an ad's ad set and campaign, an ad set's campaign), read from the
 * mirror, so limits on a campaign also cover what runs inside it. Parents never change in Meta.
 * `accountOf` holds the ids the mirror knows; callers treat the rest as unknown.
 */
export async function familyOf(userId: string, ids: string[]) {
  const rows = await q<{
    ad_account_id: string | null;
    external_ad_id: string | null;
    external_adset_id: string | null;
    external_campaign_id: string | null;
  }>(
    `SELECT DISTINCT ad_account_id, external_ad_id, external_adset_id, external_campaign_id
     FROM saved_ads WHERE user_id = $1
       AND (external_ad_id = ANY($2) OR external_adset_id = ANY($2) OR external_campaign_id = ANY($2))`,
    [userId, ids],
  );
  const family = new Set(ids);
  const accountOf = new Map<string, string | null>();
  for (const r of rows) {
    const chain = [r.external_ad_id, r.external_adset_id, r.external_campaign_id];
    chain.forEach((id, i) => {
      if (!id || !ids.includes(id)) return;
      accountOf.set(id, r.ad_account_id);
      for (const parent of chain.slice(i + 1)) if (parent) family.add(parent);
    });
  }
  return { ids: [...family], accountOf };
}

/** Ad sets and campaigns whose budgets can spend when these objects run, from the mirror. */
export async function budgetHoldersOf(userId: string, ids: string[]) {
  const rows = await q<{
    external_ad_id: string | null;
    external_adset_id: string | null;
    external_campaign_id: string | null;
  }>(
    `SELECT DISTINCT external_ad_id, external_adset_id, external_campaign_id
     FROM saved_ads WHERE user_id = $1
       AND (external_ad_id = ANY($2) OR external_adset_id = ANY($2) OR external_campaign_id = ANY($2))`,
    [userId, ids],
  );
  const adsets = new Set<string>();
  const campaigns = new Set<string>();
  const known = new Set<string>();
  for (const r of rows) {
    for (const id of [r.external_ad_id, r.external_adset_id, r.external_campaign_id]) {
      if (id && ids.includes(id)) known.add(id);
    }
    if (r.external_adset_id) adsets.add(r.external_adset_id);
    if (r.external_campaign_id) campaigns.add(r.external_campaign_id);
  }
  return { adsets: [...adsets], campaigns: [...campaigns], known };
}
