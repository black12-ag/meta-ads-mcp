import { request } from "node:https";
import { beforeAll, expect, test, vi } from "vitest";
import { resetDatabase, testPool } from "../setup/db";
import type { WebhookEvent } from "@/lib/webhooks/events";
import {
  createEndpoint,
  deleteEndpoint,
  emitEvent,
  listEndpoints,
  sendTest,
  updateEndpoint,
} from "@/lib/webhooks/store.server";
import { fakeRequest, type Sent } from "./fake-https";

vi.mock("node:https", async (orig) => ({
  ...(await orig<typeof import("node:https")>()),
  request: vi.fn(),
}));

beforeAll(resetDatabase);

async function add(userId: string, url: string, events: WebhookEvent[] = ["alert.created"]) {
  const out = await createEndpoint(userId, url, events);
  if (out.error !== null) throw new Error(out.error);
  return out;
}

test("create shows the secret once; list, update and delete only touch the owner's rows", async () => {
  const { endpoint, secret } = await add("u1", "https://hooks.example.com/a", [
    "approval.requested",
    "alert.created",
  ]);
  expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
  const listed = await listEndpoints("u1");
  expect(listed).toEqual([
    expect.objectContaining({
      id: endpoint.id,
      url: "https://hooks.example.com/a",
      events: ["approval.requested", "alert.created"],
      active: true,
      failure_count: 0,
      last_status: null,
    }),
  ]);
  expect(JSON.stringify(listed)).not.toContain("whsec_");
  expect(await listEndpoints("u2")).toEqual([]);

  expect(await updateEndpoint("u2", endpoint.id, { active: false })).toBeNull();
  expect(await updateEndpoint("u1", endpoint.id, { events: ["change.undone"] })).toMatchObject({
    events: ["change.undone"],
    active: true,
  });
  expect(await updateEndpoint("u1", endpoint.id, { active: false })).toMatchObject({
    events: ["change.undone"],
    active: false,
  });

  expect(await deleteEndpoint("u2", endpoint.id)).toBeNull();
  expect(await deleteEndpoint("u1", endpoint.id)).toEqual({ url: "https://hooks.example.com/a" });
  expect(await listEndpoints("u1")).toEqual([]);
});

test("create refuses unsafe URLs and more than 10 endpoints, even when racing", async () => {
  expect(await createEndpoint("u3", "http://hooks.example.com/a", ["alert.created"])).toEqual({
    error: "The URL must start with https://.",
  });
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      createEndpoint("u3", `https://hooks.example.com/${i}`, ["alert.created"]),
    ),
  );
  expect(results.filter((r) => r.error === null)).toHaveLength(10);
  expect(results.find((r) => r.error !== null)?.error).toBe(
    "You can have up to 10 webhooks. Delete one first.",
  );
  expect(await listEndpoints("u3")).toHaveLength(10);
});

test("emitEvent delivers to active, subscribed endpoints and records how it went", async () => {
  const sent: Sent[] = [];
  vi.mocked(request).mockImplementation(
    fakeRequest((url) => (url.hostname === "down.example.com" ? 500 : 200), sent),
  );
  await add("u5", "https://up.example.com/hook", ["approval.approved"]);
  await add("u5", "https://down.example.com/hook", ["approval.approved"]);
  await add("u5", "https://up.example.com/other-event", ["alert.created"]);
  const paused = await add("u5", "https://up.example.com/paused", ["approval.approved"]);
  await updateEndpoint("u5", paused.endpoint.id, { active: false });

  expect(emitEvent("u5", "approval.approved", { pending_id: "p1" }, "Approved.")).toBeUndefined();
  await vi.waitFor(async () => {
    const delivered = (await listEndpoints("u5")).filter((r) => r.last_delivery_at);
    expect(delivered).toHaveLength(2);
  });

  const byUrl = Object.fromEntries((await listEndpoints("u5")).map((r) => [r.url, r]));
  expect(byUrl["https://up.example.com/hook"]).toMatchObject({
    last_status: 200,
    last_error: null,
    failure_count: 0,
    active: true,
  });
  expect(byUrl["https://down.example.com/hook"]).toMatchObject({
    last_status: 500,
    last_error: "HTTP 500: nope",
    failure_count: 1,
    active: true,
  });
  expect(byUrl["https://up.example.com/other-event"].last_delivery_at).toBeNull();
  expect(byUrl["https://up.example.com/paused"].last_delivery_at).toBeNull();
  const bodies = sent.map((s) => JSON.parse(s.body));
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toMatchObject({ type: "approval.approved", data: { pending_id: "p1" } });
  expect(bodies[1].id).toBe(bodies[0].id);
});

test("20 failures in a row pause an endpoint; a test ping reports and resets the count", async () => {
  const sent: Sent[] = [];
  vi.mocked(request).mockImplementation(fakeRequest(() => 500, sent));
  const { endpoint } = await add("u6", "https://flaky.example.com/hook");
  await testPool.query("UPDATE webhook_endpoints SET failure_count = 18 WHERE id = $1", [
    endpoint.id,
  ]);

  expect(await sendTest("u6", endpoint.id)).toEqual({
    ok: false,
    status: 500,
    error: "HTTP 500: nope",
  });
  expect((await listEndpoints("u6"))[0]).toMatchObject({ failure_count: 19, active: true });
  await sendTest("u6", endpoint.id);
  expect((await listEndpoints("u6"))[0]).toMatchObject({ failure_count: 20, active: false });
  expect(JSON.parse(sent[0].body)).toMatchObject({ type: "ping" });
  expect(sent[0].headers["X-Viral4All-Event"]).toBe("ping");

  vi.mocked(request).mockImplementation(fakeRequest(() => 200));
  expect(await sendTest("u6", endpoint.id)).toEqual({ ok: true, status: 200, error: null });
  // a test reports and resets the count, but only Resume turns the endpoint back on
  expect((await listEndpoints("u6"))[0]).toMatchObject({
    failure_count: 0,
    active: false,
    last_status: 200,
    last_error: null,
  });
  expect(await updateEndpoint("u6", endpoint.id, { active: true })).toMatchObject({ active: true });
  expect(await sendTest("someone-else", endpoint.id)).toBeNull();
});
