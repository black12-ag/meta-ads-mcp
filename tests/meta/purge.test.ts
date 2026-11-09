import { beforeEach, expect, test } from "vitest";
import { resetDatabase, testPool } from "../setup/db";
import { upsertAccountSettings } from "@/lib/db/account-settings.server";
import { upsertSavedAds } from "@/lib/db/ads.server";
import { insertPendingAction } from "@/lib/db/oauth.server";
import { purgeMetaData } from "@/lib/meta/purge.server";

const settings = {
  target_cpr_cents: null,
  monthly_budget_cents: null,
  cycle_start_day: 1,
  notes: null,
  max_daily_budget_cents: 5000,
  max_raise_pct: null,
  max_changes_per_day: null,
  protected_ids: [],
};

async function seed(accountId: string) {
  await insertPendingAction({
    token_hash: `hash-${accountId}`,
    user_id: "pu",
    action: "budget",
    scope: "ads:budget",
    params: {},
    summary: {},
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    account_id: accountId,
  });
  await testPool.query(
    `INSERT INTO account_alerts (user_id, account_id, kind, severity, title) VALUES ('pu', $1, 'spend_spike', 'warn', 't')`,
    [accountId],
  );
  await testPool.query(
    `INSERT INTO account_checks (user_id, account_id, day) VALUES ('pu', $1, current_date)`,
    [accountId],
  );
  await testPool.query(
    `INSERT INTO ai_change_counts (user_id, account_id, day, n) VALUES ('pu', $1, current_date, 1)`,
    [accountId],
  );
  await upsertAccountSettings("pu", accountId, settings);
  await upsertSavedAds([
    { user_id: "pu", ad_account_id: accountId, external_ad_id: `ad-${accountId}`, name: "Ad" },
  ]);
}

const left = async () => {
  const tables = [
    "mcp_pending_actions",
    "account_alerts",
    "account_checks",
    "ai_change_counts",
    "ad_account_settings",
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    out[t] = (await testPool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  out.saved_ads = (
    await testPool.query(`SELECT count(*)::int AS n FROM saved_ads WHERE user_id = 'pu'`)
  ).rows[0].n;
  return out;
};

beforeEach(async () => {
  await resetDatabase();
  await seed("111");
  await seed("222");
});

test("disconnecting one Meta login removes that account's Meta data and keeps the owner's limits", async () => {
  await purgeMetaData("pu", ["111"]);
  expect(await left()).toEqual({
    mcp_pending_actions: 1,
    account_alerts: 1,
    account_checks: 1,
    ai_change_counts: 1,
    ad_account_settings: 2,
    saved_ads: 1,
  });
});

test("removing the app in Facebook settings removes everything from Meta, limits included", async () => {
  await purgeMetaData("pu", "all", { settings: true });
  expect(await left()).toEqual({
    mcp_pending_actions: 0,
    account_alerts: 0,
    account_checks: 0,
    ai_change_counts: 0,
    ad_account_settings: 0,
    saved_ads: 0,
  });
});
