import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import {
  deleteAdChangesByUser,
  deleteSavedAdsByUser,
  findSavedAdByExternalId,
  getSavedAdById,
  insertAdChanges,
  listAdChangeSeries,
  listAdChanges,
  listSavedAds,
  selectSavedAdsForDiff,
  updateSavedAdCreative,
  updateSavedAdStatus,
  upsertSavedAd,
  upsertSavedAds,
} from "@/lib/db/ads.server";

beforeAll(resetDatabase);

const ad = (externalId: string, spend: number) => ({
  user_id: "u1",
  platform: "meta",
  ad_account_id: "111",
  page_id: "p1",
  external_ad_id: externalId,
  external_adset_id: "as1",
  external_campaign_id: "c1",
  name: `Ad ${externalId}`,
  campaign_name: "Camp",
  adset_name: "Set",
  status: "ACTIVE",
  objective: "OUTCOME_TRAFFIC",
  destination_type: "website",
  destination_url: "https://x.test",
  call_to_action: "LEARN_MORE",
  headline: "H",
  primary_text: "P",
  description: null,
  image_url: null,
  budget_kind: "daily",
  budget_cents: 1000,
  start_time: null,
  end_time: null,
  lifetime_spend_cents: spend,
  lifetime_impressions: 10,
  lifetime_clicks: 2,
  lifetime_results: 1,
  last_synced_at: new Date().toISOString(),
});

test("upsertSavedAds updates instead of duplicating, and diff selection is scoped", async () => {
  await upsertSavedAds([ad("a1", 100), ad("a2", 200)]);
  await upsertSavedAds([ad("a1", 150)]);
  const rows = await listSavedAds("u1");
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.external_ad_id === "a1")?.lifetime_spend_cents).toBe(150);

  const diff = await selectSavedAdsForDiff("u1", ["a1", "zzz"]);
  expect(diff.map((d) => d.external_ad_id)).toEqual(["a1"]);
  expect(await selectSavedAdsForDiff("u1", [])).toEqual([]);
});

test("status and creative updates are scoped to the user", async () => {
  await updateSavedAdStatus("u1", "a2", "PAUSED");
  await updateSavedAdStatus("u2", "a1", "PAUSED");
  expect((await findSavedAdByExternalId("u1", "a2"))?.status).toBe("PAUSED");
  expect((await findSavedAdByExternalId("u1", "a1"))?.status).toBe("ACTIVE");

  await updateSavedAdCreative("u1", "a1", { headline: "New", whatsapp_number: "+251" });
  const a1 = await findSavedAdByExternalId("u1", "a1");
  expect(a1?.headline).toBe("New");
  expect(a1?.whatsapp_number).toBe("+251");
  expect(a1?.primary_text).toBe("P");
  expect(await getSavedAdById("u2", a1!.id)).toBeNull();
  expect((await getSavedAdById("u1", a1!.id))?.id).toBe(a1!.id);
});

test("single-row upsert with a subset of columns works", async () => {
  await upsertSavedAd({
    user_id: "u1",
    external_ad_id: "new1",
    name: "Created — ad",
    status: "PAUSED",
    headline: "H",
    ad_account_id: "111",
  });
  expect((await findSavedAdByExternalId("u1", "new1"))?.status).toBe("PAUSED");
});

test("change log: insert, list, series with since filter, purge", async () => {
  const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
  await insertAdChanges([
    { user_id: "u1", ad_account_id: "111", external_ad_id: "a1", field: "spend", new_value: "100", source: "sync" },
    { user_id: "u1", ad_account_id: "111", external_ad_id: "a1", field: "status", new_value: "PAUSED", previous_value: "ACTIVE", source: "action" },
    { user_id: "u1", ad_account_id: "111", external_ad_id: "a2", field: "spend", new_value: "200", source: "sync" },
  ]);
  expect(await listAdChanges("u1", { limit: 10 })).toHaveLength(3);
  expect(await listAdChanges("u1", { adId: "a2", limit: 10 })).toHaveLength(1);

  const series = await listAdChangeSeries("u1", ["spend"], old, 100);
  expect(series.map((s) => s.new_value).sort()).toEqual(["100", "200"]);
  expect(await listAdChangeSeries("u1", ["spend"], old, 100, "a1")).toHaveLength(1);
  expect(await listAdChangeSeries("u1", ["spend"], new Date(Date.now() + 1000).toISOString(), 100)).toEqual([]);

  await deleteAdChangesByUser("u1");
  await deleteSavedAdsByUser("u1");
  expect(await listAdChanges("u1", { limit: 10 })).toEqual([]);
  expect(await listSavedAds("u1")).toEqual([]);
});
