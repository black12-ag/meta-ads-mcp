import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { resetDatabase } from "../setup/db";
import { upsertAdAccounts, upsertConnection } from "@/lib/db/connections.server";
import { getInsights } from "@/lib/meta/explore.server";
import { adsetChange, decide, previewAdset, previewArchive, undo } from "@/lib/mcp/confirm.server";

// A small fake of the Graph API: daily insights, one ad set and the writes made to it.
const graph = {
  targeting: { geo_locations: { countries: ["US"] }, age_min: 18 } as Record<string, unknown>,
  status: "ACTIVE",
  validated: 0,
};
let lastInsights: URL | null = null;
const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
  const u = new URL(url);
  if (init?.method === "POST") {
    const body = new URLSearchParams(String(init.body));
    if (body.get("execution_options")?.includes("validate_only")) graph.validated += 1;
    else {
      if (body.get("targeting")) graph.targeting = JSON.parse(body.get("targeting")!);
      if (body.get("status")) graph.status = body.get("status")!;
    }
    return Response.json({ success: true });
  }
  if (u.pathname.endsWith("/act_111/insights")) {
    lastInsights = u;
    return Response.json({
      data: [
        {
          campaign_id: "C1",
          campaign_name: "Camp",
          age: "25-34",
          spend: "12.34",
          impressions: "1000",
          clicks: "40",
          cpc: "0.31",
          cpm: "12.34",
          actions: [
            { action_type: "link_click", value: "30" },
            { action_type: "lead", value: "2" },
          ],
          purchase_roas: [{ value: "2.5" }],
          date_start: "2026-10-15",
        },
      ],
    });
  }
  if (u.searchParams.get("type") === "adinterestvalid") {
    const ids = JSON.parse(u.searchParams.get("interest_fbid_list") ?? "[]") as string[];
    return Response.json({
      data: ids.filter((id) => id === "6003").map((id) => ({ id, name: "Yoga", valid: true })),
    });
  }
  if (u.searchParams.get("ids") === "AS1") {
    return Response.json({
      AS1: {
        id: "AS1",
        name: "Set 1",
        status: graph.status,
        targeting: graph.targeting,
        account_id: "111",
      },
    });
  }
  return Response.json({ error: { message: `unexpected ${url}` } }, { status: 400 });
});

beforeAll(async () => {
  await resetDatabase();
  vi.stubGlobal("fetch", fakeFetch);
  const conn = await upsertConnection({
    user_id: "eu",
    meta_user_id: "m-eu",
    meta_name: "Owner",
    meta_picture_url: null,
    access_token: "meta-token",
    token_expires_at: null,
  });
  await upsertAdAccounts([
    {
      user_id: "eu",
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

const owner = { userId: "eu", base: "https://ads.example" };
const pendingId = (url: string) => url.split("/approve/")[1];

test("reports ask Meta for breakdowns, filters and daily rows, and come back in cents", async () => {
  const report = await getInsights("eu", {
    accountId: "111",
    level: "campaign",
    campaignIds: ["C1"],
    datePreset: "last_7d",
    breakdowns: ["age"],
    daily: true,
    limit: 100,
  });
  expect(Object.fromEntries(lastInsights!.searchParams)).toMatchObject({
    level: "campaign",
    date_preset: "last_7d",
    breakdowns: "age",
    time_increment: "1",
    filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: ["C1"] }]),
  });
  expect(report.rows[0]).toMatchObject({
    campaign_name: "Camp",
    age: "25-34",
    spend: 1234,
    cpc: 31,
    cpm: 1234,
    results: 2,
    result_type: "lead",
    cost_per_result: 617,
    roas: 2.5,
    actions: { link_click: 30, lead: 2 },
  });
});

test("an ad set edit reads field by field and knows how to put things back", () => {
  const current = {
    id: "AS9",
    name: "Set",
    targeting: {
      geo_locations: { countries: ["US"] },
      age_min: 18,
      flexible_spec: [{ interests: [{ id: "1", name: "Running" }] }],
    },
  };
  const edit = adsetChange(current, {
    countries: ["GB", "IE"],
    genders: "female",
    interests: [{ id: "2", name: "Yoga" }],
  });
  expect(edit.body.targeting).toEqual({
    geo_locations: { countries: ["GB", "IE"] },
    age_min: 18,
    genders: [2],
    flexible_spec: [{ interests: [{ id: "2", name: "Yoga" }] }],
  });
  expect(edit.changes).toEqual([
    { field: "countries", from: "US", to: "GB, IE" },
    { field: "genders", from: "all", to: "female" },
    { field: "interests", from: "Running", to: "Yoga" },
  ]);
  expect(edit.undo).toEqual({ targeting: current.targeting });
  // Meta can't remove an end time that wasn't there, so that edit can't be undone
  expect(
    adsetChange({ id: "AS9", targeting: {} }, { endTime: "2026-12-01T00:00:00Z" }).undo,
  ).toBeNull();
  expect(() => adsetChange(current, {})).toThrow(/Nothing to change/);
});

test("an ad set edit waits for approval, runs, and can be undone", async () => {
  const preview = await previewAdset(owner, { adsetId: "AS1", ageMin: 25 });
  expect(preview.summary.changes).toEqual([{ field: "age from", from: 18, to: 25 }]);
  expect(graph.validated).toBe(1);
  expect(graph.targeting.age_min).toBe(18);

  const id = pendingId(preview.approve_url);
  expect(await decide("eu", id, true)).not.toHaveProperty("error");
  expect(graph.targeting.age_min).toBe(25);

  await undo("eu", id);
  expect(graph.targeting.age_min).toBe(18);
});

test("archiving waits for approval and can't be undone", async () => {
  const preview = await previewArchive(owner, ["AS1"]);
  const id = pendingId(preview.approve_url);
  expect(graph.status).toBe("ACTIVE");
  expect(await decide("eu", id, true)).toMatchObject({ result: { archived: 1 } });
  expect(graph.status).toBe("ARCHIVED");
  await expect(undo("eu", id)).rejects.toThrow(/can't be undone/);
});

test("interest names on the approval page come from Meta, not from the AI", async () => {
  const preview = await previewAdset(owner, {
    adsetId: "AS1",
    interests: [{ id: "6003", name: "Something harmless" }],
  });
  expect(preview.summary.changes).toEqual([
    expect.objectContaining({ field: "interests", to: "Yoga" }),
  ]);
  await expect(
    previewAdset(owner, { adsetId: "AS1", interests: [{ id: "999", name: "Yoga" }] }),
  ).rejects.toThrow(/isn't a valid Meta interest/);
});
