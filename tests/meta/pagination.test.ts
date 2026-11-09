import { afterEach, expect, test, vi } from "vitest";

/**
 * graphGetAll follows Graph's `paging.next` links. The first page goes through graphGet (which
 * builds the URL and adds the token); later pages are fetched from the absolute `next` URL.
 */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockPages(pages: Array<{ data: unknown[]; next?: string }>) {
  let call = 0;
  globalThis.fetch = vi.fn(async () => {
    const page = pages[Math.min(call++, pages.length - 1)];
    return new Response(
      JSON.stringify({ data: page.data, paging: page.next ? { next: page.next } : {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return () => call;
}

test("returns every page and stops when there is no next link", async () => {
  const { graphGetAll } = await import("@/lib/meta/graph.server");
  const calls = mockPages([
    { data: [{ id: "1" }, { id: "2" }], next: "https://graph.facebook.com/next-1" },
    { data: [{ id: "3" }], next: "https://graph.facebook.com/next-2" },
    { data: [{ id: "4" }] },
  ]);

  const rows = await graphGetAll<{ id: string }>("act_1/ads", "tok");
  expect(rows.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  expect(calls()).toBe(3);
});

test("a single page needs one request", async () => {
  const { graphGetAll } = await import("@/lib/meta/graph.server");
  const calls = mockPages([{ data: [{ id: "only" }] }]);
  expect(await graphGetAll("act_1/campaigns", "tok")).toEqual([{ id: "only" }]);
  expect(calls()).toBe(1);
});

test("stops at maxPages instead of looping forever on a self-referencing next", async () => {
  const { graphGetAll } = await import("@/lib/meta/graph.server");
  const calls = mockPages([{ data: [{ id: "x" }], next: "https://graph.facebook.com/same" }]);
  const rows = await graphGetAll("act_1/ads", "tok", {}, 4);
  expect(rows).toHaveLength(4);
  expect(calls()).toBe(4);
});

test("an empty edge yields an empty list", async () => {
  const { graphGetAll } = await import("@/lib/meta/graph.server");
  mockPages([{ data: [] }]);
  expect(await graphGetAll("act_1/ads", "tok")).toEqual([]);
});
