import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { resetDatabase } from "../setup/db";
import { upsertAdAccounts, upsertConnection } from "@/lib/db/connections.server";
import { insertPendingAction } from "@/lib/db/oauth.server";
import { upsertAccountSettings } from "@/lib/db/account-settings.server";
import { upsertSavedAds } from "@/lib/db/ads.server";
import { emitEvent } from "@/lib/webhooks/store.server";
import { hashKey } from "@/lib/api-keys.server";
import {
  decide,
  enforceDirect,
  outcome,
  perDay,
  previewBudget,
  previewResume,
  undo,
} from "@/lib/mcp/confirm.server";

vi.mock("@/lib/webhooks/store.server", () => ({ emitEvent: vi.fn() }));
const emitted = (type: string) =>
  vi
    .mocked(emitEvent)
    .mock.calls.filter(([, t]) => t === type)
    .map(([, , data]) => data);

// A tiny fake of the Graph API for one ad set: reads, validate-only checks and real writes.
const graph = { dailyBudget: "1000", status: "PAUSED", validated: 0, applied: 0 };
const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
  const u = new URL(url);
  if (init?.method === "POST") {
    const body = new URLSearchParams(String(init.body));
    if (body.get("execution_options")?.includes("validate_only")) graph.validated += 1;
    else {
      graph.applied += 1;
      graph.dailyBudget = body.get("daily_budget") ?? graph.dailyBudget;
      graph.status = body.get("status") ?? graph.status;
    }
    return Response.json({ success: true });
  }
  // live ad sets of a campaign
  if (u.pathname.endsWith("/adsets")) {
    return Response.json({ data: [{ id: "AS1", daily_budget: graph.dailyBudget }] });
  }
  const ids = u.searchParams.get("ids")?.split(",") ?? [];
  if (ids.length) {
    const objects: Record<string, object> = {
      AS1: {
        id: "AS1",
        name: "Ad set 1",
        daily_budget: graph.dailyBudget,
        status: graph.status,
        account_id: "111",
      },
      AS2: { id: "AS2", account_id: "222" }, // another ad account
      AS9: { id: "AS9", account_id: "111" }, // not in the mirror yet
    };
    return Response.json(Object.fromEntries(ids.map((id) => [id, objects[id]])));
  }
  return Response.json({ error: { message: `unexpected ${url}` } }, { status: 400 });
});

beforeAll(async () => {
  await resetDatabase();
  vi.stubGlobal("fetch", fakeFetch);
  const conn = await upsertConnection({
    user_id: "cu",
    meta_user_id: "m-cu",
    meta_name: "Owner",
    meta_picture_url: null,
    access_token: "meta-token",
    token_expires_at: null,
  });
  await upsertAdAccounts([
    {
      user_id: "cu",
      connection_id: conn.id,
      account_id: "111",
      name: "Main",
      currency: "USD",
      timezone_name: null,
      account_status: 1,
      spend_cap_cents: null,
      amount_spent_cents: null,
      business_name: null,
    },
  ]);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const owner = { userId: "cu", base: "https://ads.example" };
const pendingId = (url: string) => url.split("/approve/")[1];

test("a budget change is validated by Meta and waits for the owner's approval", async () => {
  const preview = await previewBudget(owner, "AS1", "daily", 2500);
  expect(preview.status).toBe("approval_required");
  expect(preview.approve_url).toMatch(/^https:\/\/ads\.example\/approve\/[0-9a-f-]{36}$/);
  expect(preview.summary).toMatchObject({ from: "$10.00", to: "$25.00", currency: "USD" });
  expect(graph.validated).toBe(1);
  expect(graph.applied).toBe(0);

  // the assistant's token can only read the outcome; nothing runs
  expect(await outcome(owner, preview.confirm_token)).toMatchObject({
    status: "waiting_for_approval",
  });
  expect(graph.applied).toBe(0);

  // another user cannot approve it
  const id = pendingId(preview.approve_url);
  await expect(decide("intruder", id, true)).rejects.toThrow(/unknown, expired or already decided/);
  expect(graph.applied).toBe(0);

  const done = await decide("cu", id, true);
  expect(done).toMatchObject({ decision: "approved", result: { verified: true } });
  // the owner's tools hear about the request and the result, with links to our own site
  expect(emitted("approval.requested")).toContainEqual(
    expect.objectContaining({
      approval_id: id,
      action: "budget",
      approve_url: expect.stringMatching(/\/approve\//),
    }),
  );
  expect(emitted("approval.approved")).toContainEqual(expect.objectContaining({ approval_id: id }));
  expect(graph.applied).toBe(1);
  expect(await outcome(owner, preview.confirm_token)).toMatchObject({
    status: "done",
    action: "budget",
  });

  // decided once
  await expect(decide("cu", id, true)).rejects.toThrow(/already decided/);
  expect(graph.applied).toBe(1);
});

test("a rejected change never runs", async () => {
  const preview = await previewBudget(owner, "AS1", "daily", 3000);
  expect(await decide("cu", pendingId(preview.approve_url), false)).toEqual({
    decision: "rejected",
  });
  expect(await outcome(owner, preview.confirm_token)).toMatchObject({ status: "rejected" });
  expect(graph.applied).toBe(1);
});

test("expired requests cannot be approved", async () => {
  const token = "cfm_expired_token_for_test";
  const { id } = await insertPendingAction({
    token_hash: await hashKey(token),
    user_id: "cu",
    action: "budget",
    scope: "ads:budget",
    params: { objectId: "AS1", kind: "daily", minorUnits: 9999 },
    summary: {},
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  await expect(decide("cu", id, true)).rejects.toThrow(/expired/);
  await expect(outcome(owner, token)).rejects.toThrow(/expired/);
  expect(graph.applied).toBe(1);
});

const noLimits = {
  target_cpr_cents: null,
  monthly_budget_cents: null,
  cycle_start_day: 1,
  notes: null,
  max_daily_budget_cents: null,
  max_raise_pct: null,
  max_changes_per_day: null,
  protected_ids: [],
};

test("your limits block a request before Meta or the owner sees it", async () => {
  await upsertAccountSettings("cu", "111", { ...noLimits, max_daily_budget_cents: 5000 });
  const validated = graph.validated;
  await expect(previewBudget(owner, "AS1", "daily", 6000)).rejects.toThrow(
    /Blocked by your limits: Above your daily budget limit of \$50\.00/,
  );
  expect(graph.validated).toBe(validated);

  // protecting a campaign covers the ad sets inside it (read from the mirror)
  await upsertSavedAds([
    {
      user_id: "cu",
      ad_account_id: "111",
      external_ad_id: "AD1",
      external_adset_id: "AS1",
      external_campaign_id: "C1",
      name: "Ad 1",
    },
  ]);
  await upsertAccountSettings("cu", "111", { ...noLimits, protected_ids: ["C1"] });
  await expect(previewBudget(owner, "AS1", "daily", 3000)).rejects.toThrow(/C1 is protected/);
  expect(emitted("request.blocked")).toContainEqual(
    expect.objectContaining({ reason: expect.stringMatching(/C1 is protected/) }),
  );
  await upsertAccountSettings("cu", "111", noLimits);
});

test("limits are checked again when the owner approves", async () => {
  const applied = graph.applied;
  const preview = await previewBudget(owner, "AS1", "daily", 4000);
  expect(preview.summary.checks).toEqual([expect.objectContaining({ ok: true })]);
  await upsertAccountSettings("cu", "111", { ...noLimits, max_daily_budget_cents: 3000 });
  expect(await decide("cu", pendingId(preview.approve_url), true)).toMatchObject({
    decision: "approved",
    error: expect.stringMatching(/Blocked by your limits/),
  });
  expect(graph.applied).toBe(applied);
  await upsertAccountSettings("cu", "111", noLimits);
});

test("an applied change can be undone once, and the assistant reads the owner's note", async () => {
  const before = graph.dailyBudget;
  const preview = await previewBudget(owner, "AS1", "daily", 3500);
  const id = pendingId(preview.approve_url);
  await decide("cu", id, true, "ok for this week only");
  expect(graph.dailyBudget).toBe("3500");
  expect(await outcome(owner, preview.confirm_token)).toMatchObject({
    status: "done",
    owner_note: "ok for this week only",
  });

  await expect(undo("intruder", id)).rejects.toThrow(/can't be undone/);
  await undo("cu", id);
  expect(graph.dailyBudget).toBe(before);
  expect(emitted("change.undone")).toContainEqual(expect.objectContaining({ approval_id: id }));
  expect(await outcome(owner, preview.confirm_token)).toMatchObject({ status: "undone" });
  await expect(undo("cu", id)).rejects.toThrow(/can't be undone/);
});

test("changes per day count applied changes, never the one being approved", async () => {
  // two applied so far: the first budget change and the undone one
  await upsertAccountSettings("cu", "111", { ...noLimits, max_changes_per_day: 2 });
  await expect(previewBudget(owner, "AS1", "daily", 2600)).rejects.toThrow(/2 AI changes per day/);

  await upsertAccountSettings("cu", "111", { ...noLimits, max_changes_per_day: 3 });
  const preview = await previewResume(owner, ["AS1"]);
  const id = pendingId(preview.approve_url);
  expect(await decide("cu", id, true)).not.toHaveProperty("error");
  expect(graph.status).toBe("ACTIVE");

  await undo("cu", id);
  expect(graph.status).toBe("PAUSED");
  await upsertAccountSettings("cu", "111", noLimits);
});

test("direct changes (REST API keys, AI pauses) meet the same limits", async () => {
  // AS1 sits in campaign C1 (mirror row from an earlier test)
  await upsertAccountSettings("cu", "111", { ...noLimits, protected_ids: ["C1"] });
  await expect(enforceDirect("cu", ["AS1"], { pause: true })).rejects.toThrow(/C1 is protected/);

  // a pause only stops spend: the per-day count and budget rules don't apply to it
  await upsertAccountSettings("cu", "111", {
    ...noLimits,
    max_daily_budget_cents: 5000,
    max_changes_per_day: 1,
  });
  await expect(enforceDirect("cu", ["AS1"], { pause: true })).resolves.toBeUndefined();
  await expect(
    enforceDirect("cu", ["AS1"], { budget: { kind: "daily", to: 6000 } }),
  ).rejects.toThrow(/daily budget limit/);
  await expect(enforceDirect("cu", ["AS1"])).rejects.toThrow(/1 AI change per day/);

  // direct changes count too: three applied by approval so far, so a cap of 4 allows one more
  await upsertAccountSettings("cu", "111", { ...noLimits, max_changes_per_day: 4 });
  await enforceDirect("cu", ["AS1"]);
  await expect(enforceDirect("cu", ["AS1"])).rejects.toThrow(/4 AI changes per day/);

  // one ad account per request, and an object the mirror hasn't seen can't pass a protected list
  await expect(enforceDirect("cu", ["AS1", "AS2"], { pause: true })).rejects.toThrow(
    /one ad account at a time/,
  );
  await upsertAccountSettings("cu", "111", { ...noLimits, protected_ids: ["C1"] });
  await expect(enforceDirect("cu", ["AS9"], { pause: true })).rejects.toThrow(/isn't synced yet/);
  await upsertAccountSettings("cu", "111", noLimits);
  await expect(enforceDirect("cu", ["AS9"], { pause: true })).resolves.toBeUndefined();
});

test("a new campaign from an AI or API key fits the daily cap and counts as a change", async () => {
  const { updateConnection } = await import("@/lib/db/connections.server");
  const { requireConnection } = await import("@/lib/meta/store.server");
  const { enforceNewCampaign } = await import("@/lib/mcp/confirm.server");
  await updateConnection((await requireConnection("cu")).id, { active_ad_account_id: "111" });
  await upsertAccountSettings("cu", "111", { ...noLimits, max_daily_budget_cents: 5000 });

  const daily = (budgetMinorUnits: number) =>
    enforceNewCampaign("cu", { budgetKind: "daily", budgetMinorUnits });
  await expect(daily(100_000_000)).rejects.toThrow(/daily budget limit/);
  await expect(daily(5000)).resolves.toBeUndefined();
  // a lifetime budget is spread over its days: 30 days by default
  const lifetime = (budgetMinorUnits: number, endTime?: string) =>
    enforceNewCampaign("cu", { budgetKind: "lifetime", budgetMinorUnits, endTime });
  await expect(lifetime(150_000)).resolves.toBeUndefined();
  await expect(lifetime(150_001)).rejects.toThrow(/daily budget limit/);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  await expect(lifetime(20_000, tomorrow)).rejects.toThrow(/daily budget limit/);
  // a start time in the past doesn't stretch the period: Meta would start spending now
  await expect(
    enforceNewCampaign("cu", {
      budgetKind: "lifetime",
      budgetMinorUnits: 20_000,
      startTime: "2000-01-01T00:00:00Z",
      endTime: tomorrow,
    }),
  ).rejects.toThrow(/daily budget limit/);

  // the calls above took today's slots, so a cap of 1 is already used up
  await upsertAccountSettings("cu", "111", { ...noLimits, max_changes_per_day: 1 });
  await expect(daily(100)).rejects.toThrow(/per day/);
  await upsertAccountSettings("cu", "111", noLimits);
});

test("resuming checks every budget it would spend under against the daily cap", async () => {
  await upsertAccountSettings("cu", "111", { ...noLimits, max_daily_budget_cents: 5000 });
  graph.dailyBudget = "9000"; // raised in Ads Manager, above the cap
  await expect(enforceDirect("cu", ["AS1"], { resume: true })).rejects.toThrow(
    /daily budget limit/,
  );
  await expect(previewResume(owner, ["AS1"])).rejects.toThrow(/daily budget limit/);
  // an ad runs under its ad set's budget
  await expect(enforceDirect("cu", ["AD1"], { resume: true })).rejects.toThrow(
    /daily budget limit/,
  );
  // a campaign runs under its ad sets, read live from Meta
  await expect(enforceDirect("cu", ["C1"], { resume: true })).rejects.toThrow(/daily budget limit/);
  // an object the mirror hasn't seen can't be checked, so it waits for a sync
  await expect(enforceDirect("cu", ["AS9"], { resume: true })).rejects.toThrow(/isn't synced yet/);
  // pausing is always allowed
  await expect(enforceDirect("cu", ["AS1"], { pause: true })).resolves.toBeUndefined();

  graph.dailyBudget = "1000";
  await expect(enforceDirect("cu", ["AS1"], { resume: true })).resolves.toBeUndefined();
  await upsertAccountSettings("cu", "111", noLimits);
});

test("a lifetime budget counts per day over the days it has left; an unreadable one fails closed", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  expect(perDay({ id: "a", daily_budget: "700" }, now)).toBe(700);
  expect(perDay({ id: "a", lifetime_budget: "1000", end_time: "2026-10-11T00:00:00Z" }, now)).toBe(
    100,
  );
  // a start in the past doesn't stretch the period
  expect(
    perDay(
      {
        id: "a",
        lifetime_budget: "1000",
        start_time: "2000-01-01",
        end_time: "2026-10-02T00:00:00Z",
      },
      now,
    ),
  ).toBe(1000);
  expect(perDay({ id: "a", lifetime_budget: "1000" }, now)).toBeNaN();
  expect(perDay({ id: "a" }, now)).toBe(0);
});
