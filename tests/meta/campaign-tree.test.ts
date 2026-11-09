import { expect, test } from "vitest";
import { assembleCampaignTree } from "@/lib/meta/ads.server";

const insights = { data: [{ spend: "1.50", impressions: "100", clicks: "10" }] };

test("nests ad sets under campaigns and ads under ad sets", () => {
  const tree = assembleCampaignTree(
    [
      { id: "c1", name: "Camp one", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_TRAFFIC", daily_budget: "1000", insights },
      { id: "c2", name: "Camp two", status: "PAUSED" },
    ],
    [
      { id: "s1", name: "Set one", status: "ACTIVE", campaign_id: "c1", daily_budget: "500", insights },
      { id: "s2", name: "Set two", status: "PAUSED", campaign_id: "c1" },
      { id: "s3", name: "Set three", status: "ACTIVE", campaign_id: "c2" },
    ],
    [
      { id: "a1", name: "Ad one", status: "ACTIVE", adset_id: "s1", campaign_id: "c1", insights },
      { id: "a2", name: "Ad two", status: "PAUSED", adset_id: "s1", campaign_id: "c1" },
      { id: "a3", name: "Ad three", status: "ACTIVE", adset_id: "s3", campaign_id: "c2" },
    ],
  );

  expect(tree.map((c) => c.id)).toEqual(["c1", "c2"]);
  expect(tree[0].adsets.map((s) => s.id)).toEqual(["s1", "s2"]);
  expect(tree[0].adsets[0].ads.map((a) => a.id)).toEqual(["a1", "a2"]);
  expect(tree[0].adsets[1].ads).toEqual([]);
  expect(tree[1].adsets[0].ads.map((a) => a.id)).toEqual(["a3"]);

  // budgets and insights survive the assembly
  expect(tree[0].dailyBudget).toBe(1000);
  expect(tree[0].adsets[0].dailyBudget).toBe(500);
  expect(tree[0].insights.spend).toBe(150); // cents
  expect(tree[0].adsets[0].ads[0].insights.impressions).toBe(100);
});

test("effective status falls back to status, and missing insights are zeroed", () => {
  const [c] = assembleCampaignTree([{ id: "c1", name: "C", status: "PAUSED" }], [], []);
  expect(c.effectiveStatus).toBe("PAUSED");
  expect(c.insights.spend).toBe(0);
  expect(c.insights.impressions).toBe(0);
});

test("ad sets and ads whose parent is missing are dropped, never misfiled", () => {
  const tree = assembleCampaignTree(
    [{ id: "c1", name: "C", status: "ACTIVE" }],
    [{ id: "s9", name: "Orphan set", status: "ACTIVE", campaign_id: "gone" }],
    [{ id: "a9", name: "Orphan ad", status: "ACTIVE", adset_id: "gone" }],
  );
  expect(tree).toHaveLength(1);
  expect(tree[0].adsets).toEqual([]);
});

test("handles an account larger than one Graph page", () => {
  const campaigns = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, status: "ACTIVE" }));
  const adsets = Array.from({ length: 120 }, (_, i) => ({
    id: `s${i}`, name: `S${i}`, status: "ACTIVE", campaign_id: `c${i % 3}`,
  }));
  const ads = Array.from({ length: 600 }, (_, i) => ({
    id: `a${i}`, name: `A${i}`, status: "ACTIVE", adset_id: `s${i % 120}`,
  }));

  const tree = assembleCampaignTree(campaigns, adsets, ads);
  expect(tree.reduce((n, c) => n + c.adsets.length, 0)).toBe(120);
  expect(tree.reduce((n, c) => n + c.adsets.reduce((m, s) => m + s.ads.length, 0), 0)).toBe(600);
});
