import { expect, test } from "vitest";
import {
  accountFindings,
  addDays,
  type CampaignState,
  type Goals,
  type InsightRow,
} from "@/lib/alerts/rules";

const TODAY = "2026-10-22"; // a Thursday, so yesterday is a Wednesday

const LEADS = (n: number) => [{ action_type: "lead", value: String(n) }];

/**
 * days rows back from today (n = days ago, 0 = today), each $20.00, 2,000 impressions, 40 clicks
 * (2% CTR) and 4 leads ($5.00 a lead). over[n] changes one day; null drops it (no delivery).
 */
function rows(
  over: Record<number, Partial<InsightRow> | null> = {},
  base: Partial<InsightRow> = {},
  days = 31,
): InsightRow[] {
  return Array.from({ length: days }, (_, n) => n)
    .filter((n) => over[n] !== null)
    .map((n) => ({
      date_start: addDays(TODAY, -n),
      spend: "20.00",
      impressions: "2000",
      clicks: "40",
      actions: LEADS(4),
      ...base,
      ...over[n],
    }));
}

const running: CampaignState[] = [
  {
    id: "c1",
    status: "ACTIVE",
    adsets: [{ ads: [{ name: "Ad A", status: "ACTIVE", effectiveStatus: "ACTIVE" }] }],
  },
];

const check = (o: Partial<Parameters<typeof accountFindings>[0]> = {}) =>
  accountFindings({
    today: TODAY,
    currency: "USD",
    rows: rows(),
    accountStatus: 1,
    campaigns: running,
    goals: null,
    ...o,
  });

const goals = (g: Partial<Goals>): Goals => ({
  target_cpr_cents: null,
  monthly_budget_cents: null,
  cycle_start_day: 1,
  ...g,
});

test("a steady account has nothing to report", () => {
  expect(check()).toEqual([]);
});

test("a brand-new account has nothing to judge against", () => {
  const fresh = rows({ 1: { spend: "80.00", clicks: "5", actions: [] } }, {}, 2);
  expect(check({ rows: fresh })).toEqual([]);
});

test("a spend spike against the same weekday's 4-week average", () => {
  expect(check({ rows: rows({ 1: { spend: "60.00", actions: LEADS(12) } }) })).toEqual([
    {
      kind: "spend_spike",
      severity: "warn",
      title: "Spend jumped yesterday",
      detail: "You spent $60.00, more than twice the usual $20.00 for a Wednesday.",
    },
  ]);
  expect(check({ rows: rows({ 1: { spend: "35.00", actions: LEADS(7) } }) })).toEqual([]);
});

test("money is converted per currency: yen have no minor unit", () => {
  const yen = rows({ 1: { spend: "6000", actions: LEADS(12) } }, { spend: "2000" });
  expect(check({ rows: yen, currency: "JPY" })[0].detail).toBe(
    "You spent ¥6,000, more than twice the usual ¥2,000 for a Wednesday.",
  );
});

test.each([
  ["fewer than 3 of the 4 same weekdays had spend", rows({ 1: { spend: "60.00" } }, {}, 12)],
  ["it stays under the 5.00 floor", rows({ 1: { spend: "4.00" } }, { spend: "1.00" })],
])("no spike when %s", (_, r) => {
  expect(check({ rows: r }).map((f) => f.kind)).not.toContain("spend_spike");
});

test("spend stopped while the account and a campaign are active", () => {
  expect(check({ rows: rows({ 1: null }) })).toEqual([
    {
      kind: "spend_stopped",
      severity: "warn",
      title: "Spend stopped yesterday",
      detail:
        "Nothing was spent, while a usual Wednesday spends $20.00 and campaigns are set to run. Check delivery, billing and ad review in Meta Ads Manager.",
    },
  ]);
  const paused = [{ ...running[0], status: "PAUSED" }];
  expect(check({ rows: rows({ 1: null }), campaigns: paused })).toEqual([]);
});

test("an inactive account is critical and comes first; a stop is not reported on top", () => {
  expect(check({ rows: rows({ 1: null }), accountStatus: 3 })).toEqual([
    {
      kind: "account_inactive",
      severity: "critical",
      title: "Ad account is not active",
      detail:
        "Meta reports it as unsettled: a payment failed. Check Billing and Account quality in Meta Ads Manager.",
    },
  ]);
  const spike = rows({ 1: { spend: "60.00", actions: LEADS(12) } });
  expect(check({ rows: spike, accountStatus: 2 }).map((f) => f.kind)).toEqual([
    "account_inactive",
    "spend_spike",
  ]);
  expect(check({ accountStatus: null })).toEqual([]);
});

test("cost per result against the owner's target", () => {
  expect(check({ goals: goals({ target_cpr_cents: 300 }) })).toEqual([
    {
      kind: "cost_per_result",
      severity: "warn",
      title: "Cost per lead is high",
      detail: "Yesterday a lead cost $5.00, against your target of $3.00.",
    },
  ]);
  expect(check({ goals: goals({ target_cpr_cents: 400 }) })).toEqual([]); // under 1.5 × $4.00
});

test("cost per result against the 4-week average, and spend with no results", () => {
  expect(check({ rows: rows({ 1: { actions: LEADS(2) } }) })).toEqual([
    {
      kind: "cost_per_result",
      severity: "warn",
      title: "Cost per lead is high",
      detail: "Yesterday a lead cost $10.00, against $5.00 over the 4 weeks before.",
    },
  ]);
  expect(check({ rows: rows({ 1: { actions: [] } }) }).map((f) => f.detail)).toEqual([
    "Yesterday you spent $20.00 and got no leads.",
  ]);
});

test("a result is the first of purchase, lead, conversation, link click with 3 in the baseline", () => {
  const purchase = { action_type: "offsite_conversion.fb_pixel_purchase", value: "2" };
  const shop = rows({ 1: { actions: LEADS(4) } }, { actions: [...LEADS(4), purchase] });
  expect(check({ rows: shop }).map((f) => [f.title, f.detail])).toEqual([
    ["Cost per purchase is high", "Yesterday you spent $20.00 and got no purchases."],
  ]);
  // 2 leads in 4 weeks is too few to judge
  const thin = rows({ 1: { actions: [] }, 5: { actions: LEADS(2) } }, { actions: [] });
  expect(check({ rows: thin })).toEqual([]);
});

test("a CTR drop, only with 1,000 impressions", () => {
  expect(check({ rows: rows({ 1: { clicks: "20" } }) })).toEqual([
    {
      kind: "ctr_drop",
      severity: "warn",
      title: "Click-through rate dropped",
      detail: "Yesterday's click-through rate was 1.00%, against 2.00% over the 4 weeks before.",
    },
  ]);
  expect(check({ rows: rows({ 1: { impressions: "900", clicks: "5" } }) })).toEqual([]);
});

test("ads set to run that Meta disapproved or flagged", () => {
  const ad = (name: string, status: string, effectiveStatus: string) => ({
    name,
    status,
    effectiveStatus,
  });
  const campaign = (ads: CampaignState["adsets"][number]["ads"]) => [
    { id: "c1", status: "ACTIVE", adsets: [{ ads }] },
  ];
  expect(
    check({
      campaigns: campaign([
        ad("Spring sale", "ACTIVE", "DISAPPROVED"),
        ad("Promo B", "ACTIVE", "WITH_ISSUES"),
        ad("Old ad", "PAUSED", "DISAPPROVED"),
        ad("Fine", "ACTIVE", "ACTIVE"),
      ]),
    }),
  ).toEqual([
    {
      kind: "ad_problems",
      severity: "warn",
      title: "2 ads disapproved or with issues",
      detail:
        "Spring sale (disapproved), Promo B (with issues). Open them in Meta Ads Manager to see why.",
    },
  ]);
  const many = campaign(["A", "B", "C", "D", "E"].map((n) => ad(n, "ACTIVE", "DISAPPROVED")));
  expect(check({ campaigns: many })[0].detail).toBe(
    "A (disapproved), B (disapproved), C (disapproved) and 2 more. Open them in Meta Ads Manager to see why.",
  );
});

// $20.00 a day including today. Cycle from the 1st: $440 so far, on pace for $620 by Nov 1.
test.each([
  [1, 100000, null],
  [1, 60000, "On pace to go over the monthly budget"],
  [1, 50000, "88% of the monthly budget used"],
  [1, 44000, "Monthly budget used up"],
  [15, 19000, "84% of the monthly budget used"], // from Oct 15: $160 so far
  [15, 16000, "Monthly budget used up"],
  [25, 55000, "Monthly budget used up"], // from Sep 25: $560 so far
  [22, 2400, "83% of the monthly budget used"], // the cycle starts today: no pace yet
])("monthly budget, cycle from day %i, budget %i: %s", (day, budget, title) => {
  const found = check({ goals: goals({ monthly_budget_cents: budget, cycle_start_day: day }) });
  expect(found.map((f) => f.title)).toEqual(title ? [title] : []);
  if (title === "Monthly budget used up") expect(found[0].severity).toBe("critical");
});

test("the budget detail names the cycle and the pace; nothing set to run means no guard", () => {
  expect(check({ goals: goals({ monthly_budget_cents: 60000 }) })).toEqual([
    {
      kind: "monthly_budget",
      severity: "warn",
      title: "On pace to go over the monthly budget",
      detail:
        "$440.00 of your $600.00 monthly budget is spent (cycle started 2026-10-01). At this pace the cycle ends near $620.00.",
    },
  ]);
  expect(check({ goals: goals({ monthly_budget_cents: 10000 }), campaigns: [] })).toEqual([]);
});
