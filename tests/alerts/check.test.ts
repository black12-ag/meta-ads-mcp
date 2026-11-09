import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { resetDatabase, testPool } from "../setup/db";
import { recentAlerts, runAccountChecks } from "@/lib/alerts/check.server";
import { addDays, type CampaignState, type InsightRow } from "@/lib/alerts/rules";
import { upsertAdAccounts, upsertConnection } from "@/lib/db/connections.server";
import { notifyAccountAlerts } from "@/lib/email/notify.server";
import { proposePause } from "@/lib/mcp/confirm.server";

vi.mock("@/lib/email/notify.server", () => ({
  notifyAccountAlerts: vi.fn(async () => ({ ok: true, id: "em_1" })),
}));
vi.mock("@/lib/mcp/confirm.server", () => ({
  proposePause: vi.fn(async () => ({ status: "approval_required" })),
}));

// The test accounts have no time zone, so their day is the UTC day.
const today = new Date().toISOString().slice(0, 10);

/** 31 days of $20.00, 2,000 impressions, 40 clicks and 4 leads: nothing unusual. */
const steady = (todaySpend = "20.00"): InsightRow[] =>
  Array.from({ length: 31 }, (_, n) => ({
    date_start: addDays(today, -n),
    spend: n === 0 ? todaySpend : "20.00",
    impressions: "2000",
    clicks: "40",
    actions: [{ action_type: "lead", value: "4" }],
  }));

// Daily insights per ad account; an account without rows gets a Meta error.
const insights: Record<string, InsightRow[]> = {
  "111": steady(),
  "222": steady("500.00"),
  "444": steady(),
  "555": [{ date_start: today, spend: "90.00" }],
};
const fetchMock = vi.fn(async (url: string) => {
  // the fresh account status read: no news, so the stored status stands
  if (/act_\d+$/.test(new URL(url).pathname)) return Response.json({});
  const account = new URL(url).pathname.match(/act_(\d+)\/insights$/)?.[1] ?? "";
  return insights[account]
    ? Response.json({ data: insights[account] })
    : Response.json({ error: { message: "Service unavailable" } }, { status: 503 });
});

const campaigns: CampaignState[] = [
  {
    id: "c1",
    status: "ACTIVE",
    adsets: [{ ads: [{ name: "Ad A", status: "ACTIVE", effectiveStatus: "ACTIVE" }] }],
  },
  { id: "c2", status: "PAUSED", adsets: [] },
  { id: "c3", status: "ACTIVE", adsets: [] },
];

const alertsOf = async (accountId: string) =>
  (
    await testPool.query(
      "SELECT kind, severity, title, detail FROM account_alerts WHERE account_id = $1",
      [accountId],
    )
  ).rows;
const checkedDays = async (accountId: string) =>
  (
    await testPool.query("SELECT day::text FROM account_checks WHERE account_id = $1", [accountId])
  ).rows.map((r) => r.day);

beforeAll(async () => {
  await resetDatabase();
  vi.stubGlobal("fetch", fetchMock);
  const conn = await upsertConnection({
    user_id: "u1",
    meta_user_id: "m1",
    meta_name: "Owner",
    meta_picture_url: null,
    access_token: "meta-token",
    token_expires_at: null,
  });
  const account = (account_id: string, account_status: number) => ({
    user_id: "u1",
    connection_id: conn.id,
    account_id,
    name: `Account ${account_id}`,
    currency: "USD",
    timezone_name: null,
    account_status,
    spend_cap_cents: null,
    amount_spent_cents: null,
    business_name: null,
  });
  await upsertAdAccounts(
    ["111", "222", "333", "444", "555"].map((id) => account(id, id === "111" ? 2 : 1)),
  );
  // $100.00 monthly budgets: 222 spent $500 today alone, 555 has spent $90 this cycle.
  await testPool.query(
    `INSERT INTO ad_account_settings (user_id, account_id, monthly_budget_cents)
     VALUES ('u1', '222', 10000), ('u1', '555', 10000)`,
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
});

test("findings are stored and emailed, and an account is checked once a day", async () => {
  const findings = await runAccountChecks("u1", "111", campaigns);
  expect(findings).toEqual([
    expect.objectContaining({ kind: "account_inactive", severity: "critical" }),
  ]);

  // the fresh account status, then the daily insights
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const url = new URL(fetchMock.mock.calls[1][0]);
  expect(url.pathname).toBe("/v24.0/act_111/insights");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    access_token: "meta-token",
    fields: "spend,impressions,clicks,actions",
    time_increment: "1",
    time_range: JSON.stringify({ since: addDays(today, -30), until: today }),
  });

  expect(await alertsOf("111")).toEqual([
    {
      kind: "account_inactive",
      severity: "critical",
      title: "Ad account is not active",
      detail: expect.stringContaining("disabled"),
    },
  ]);
  expect(notifyAccountAlerts).toHaveBeenCalledWith("u1", {
    accountId: "111",
    accountName: "Account 111",
    day: today,
    findings,
    pauseRequested: false,
  });
  expect(proposePause).not.toHaveBeenCalled();

  // a later sync the same day does nothing
  expect(await runAccountChecks("u1", "111", campaigns)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(notifyAccountAlerts).toHaveBeenCalledTimes(1);
  expect(await alertsOf("111")).toHaveLength(1);
  expect(await checkedDays("111")).toEqual([today]);
});

test("a quiet account is checked once and stores and sends nothing", async () => {
  expect(await runAccountChecks("u1", "444", campaigns)).toEqual([]);
  expect(await runAccountChecks("u1", "444", campaigns)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await alertsOf("444")).toEqual([]);
  expect(notifyAccountAlerts).not.toHaveBeenCalled();
});

test("a used-up monthly budget asks the owner to pause the active campaigns", async () => {
  const findings = await runAccountChecks("u1", "222", campaigns);
  expect(findings?.map((f) => [f.kind, f.severity])).toEqual([["monthly_budget", "critical"]]);
  expect(proposePause).toHaveBeenCalledTimes(1);
  expect(proposePause).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "u1", requester: "app:Budget guard" }),
    ["c1", "c3"],
    expect.stringContaining("of your $100.00 monthly budget is spent"),
  );
  expect(notifyAccountAlerts).toHaveBeenCalledWith(
    "u1",
    expect.objectContaining({ accountId: "222", pauseRequested: true }),
  );
  expect((await alertsOf("222"))[0].detail).toMatch(
    /A request to pause 2 active campaigns is waiting for your approval\.$/,
  );
});

test("an approaching budget only warns", async () => {
  expect(await runAccountChecks("u1", "555", campaigns)).toEqual([
    expect.objectContaining({
      kind: "monthly_budget",
      severity: "warn",
      title: "90% of the monthly budget used",
    }),
  ]);
  expect(proposePause).not.toHaveBeenCalled();
  expect(notifyAccountAlerts).toHaveBeenCalledWith(
    "u1",
    expect.objectContaining({ accountId: "555", pauseRequested: false }),
  );
});

test("a failed Graph call never throws and frees the day for the next sync", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await runAccountChecks("u1", "333", campaigns)).toBeNull();
  expect(logged).toHaveBeenCalledWith(
    "[alerts] 333 check failed: Meta API 503: Service unavailable",
  );
  expect(await checkedDays("333")).toEqual([]);
  logged.mockRestore();

  insights["333"] = steady();
  expect(await runAccountChecks("u1", "333", campaigns)).toEqual([]);
  expect(await checkedDays("333")).toEqual([today]);
});

test("an ad account that is not connected is skipped", async () => {
  expect(await runAccountChecks("u1", "999", campaigns)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the Home card gets the latest alert of each kind from the last 7 days, at most 10", async () => {
  await testPool.query(
    `INSERT INTO account_alerts (user_id, account_id, kind, severity, title, created_at)
     SELECT 'u2', '1', 'k' || i, 'warn', 'Alert ' || i, now() - i * interval '1 minute'
     FROM generate_series(1, 12) i`,
  );
  await testPool.query(
    `INSERT INTO account_alerts (user_id, account_id, kind, severity, title, created_at) VALUES
       ('u2', '1', 'k1', 'warn', 'Older k1', now() - interval '2 days'),
       ('u2', '1', 'old', 'critical', 'Too old', now() - interval '8 days')`,
  );
  expect((await recentAlerts("u2")).map((a) => a.title)).toEqual(
    Array.from({ length: 10 }, (_, i) => `Alert ${i + 1}`),
  );
});
