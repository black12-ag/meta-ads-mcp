import { describe, expect, it } from "vitest";
import { perDay } from "@/lib/mcp/confirm.server";
import { budget } from "@/lib/meta/ads.server";

// Meta sends "0" for the budget kind an object doesn't use; "0" is a truthy string.
describe("budget reading", () => {
  it('treats Meta\'s "0" as no budget of that kind', () => {
    expect(budget("0")).toBeNull();
    expect(budget(undefined)).toBeNull();
    expect(budget("100")).toBe(100);
  });

  it('spreads a lifetime budget over its days even when daily_budget is "0"', () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    const adset = {
      id: "1",
      daily_budget: "0",
      lifetime_budget: "7000",
      end_time: "2026-11-08T00:00:00Z",
    };
    expect(perDay(adset, now)).toBe(1000);
    expect(perDay({ id: "2", daily_budget: "500", lifetime_budget: "0" }, now)).toBe(500);
  });
});
