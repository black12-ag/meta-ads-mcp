import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import { ensureProfile } from "@/lib/db/profiles.server";
import {
  campaignSummaryRows,
  insertCampaign,
  insertPost,
  listCampaigns,
  listPosts,
  updateCampaignStatus,
} from "@/lib/db/workspace.server";
import { one } from "@/lib/db/pool.server";

beforeAll(resetDatabase);

test("campaigns: insert, list with filters, summary rows, scoped status update", async () => {
  const c = await insertCampaign({ user_id: "u1", name: "A", platform: "meta", objective: "traffic", budget_cents: 5000 });
  await insertCampaign({ user_id: "u1", name: "B", platform: "x", objective: "awareness", budget_cents: 0 });
  await insertCampaign({ user_id: "u2", name: "C", platform: "meta", objective: "awareness", budget_cents: 0 });

  expect(await listCampaigns("u1", { limit: 10 })).toHaveLength(2);
  expect((await listCampaigns("u1", { platform: "meta", limit: 10 }))[0].name).toBe("A");
  expect(await listCampaigns("u1", { status: "active", limit: 10 })).toEqual([]);
  expect(await campaignSummaryRows("u1", "x")).toHaveLength(1);

  expect(await updateCampaignStatus("u2", c.id, "active")).toBeNull();
  expect((await updateCampaignStatus("u1", c.id, "active"))?.status).toBe("active");
  expect((await listCampaigns("u1", { status: "active", limit: 10 }))[0].id).toBe(c.id);
});

test("posts: insert and list", async () => {
  await insertPost({ user_id: "u1", content: "hello", platform: "x", status: "draft", scheduled_at: null });
  await insertPost({ user_id: "u1", content: "later", platform: "linkedin", status: "scheduled", scheduled_at: new Date().toISOString() });
  expect(await listPosts("u1", { limit: 10 })).toHaveLength(2);
  expect((await listPosts("u1", { status: "scheduled", limit: 10 }))[0].platform).toBe("linkedin");
});

test("ensureProfile is idempotent and never blanks an email", async () => {
  expect(await ensureProfile("f1", "a@b.c", "A")).toBe(true); // created: welcome email may go
  expect(await ensureProfile("f1", null, null)).toBe(false); // existing: never again
  const row = await one<{ email: string; display_name: string }>("select email, display_name from profiles where id='f1'");
  expect(row.email).toBe("a@b.c");
  expect(row.display_name).toBe("A");
});
