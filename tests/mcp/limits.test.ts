import { expect, test } from "vitest";
import {
  budgetViolation,
  cycleStart,
  dailyCountViolation,
  formatMinor,
  fromMinor,
  protectedViolation,
  toMinor,
  type Limits,
} from "@/lib/limits";

const limits: Limits = {
  max_daily_budget_cents: 5000,
  max_raise_pct: 50,
  max_changes_per_day: 2,
  protected_ids: ["C1"],
};

test("no limits set means nothing is blocked", () => {
  expect(
    budgetViolation(null, { kind: "daily", from: 100, to: 10_000_000, currency: "USD" }),
  ).toBeNull();
  expect(protectedViolation(null, ["C1"])).toBeNull();
  expect(dailyCountViolation(null, 99)).toBeNull();
});

test("daily budget ceiling and max raise per change", () => {
  expect(budgetViolation(limits, { kind: "daily", from: 1000, to: 5000, currency: "USD" })).toMatch(
    /50%/,
  );
  expect(
    budgetViolation(limits, { kind: "daily", from: 4000, to: 5000, currency: "USD" }),
  ).toBeNull();
  expect(budgetViolation(limits, { kind: "daily", from: 4000, to: 5001, currency: "USD" })).toMatch(
    /\$50\.00/,
  );
  // lowering is always fine; lifetime budgets ignore the daily ceiling but keep the raise rule
  expect(
    budgetViolation(limits, { kind: "daily", from: 5000, to: 100, currency: "USD" }),
  ).toBeNull();
  expect(
    budgetViolation(limits, { kind: "lifetime", from: 10_000, to: 20_000, currency: "USD" }),
  ).toMatch(/50%/);
  expect(
    budgetViolation(limits, { kind: "lifetime", from: 10_000, to: 15_000, currency: "USD" }),
  ).toBeNull();
});

test("protected objects and changes per day", () => {
  expect(protectedViolation(limits, ["X", "C1"])).toMatch(/C1 is protected/);
  expect(protectedViolation(limits, ["X"])).toBeNull();
  expect(dailyCountViolation(limits, 1)).toBeNull();
  expect(dailyCountViolation(limits, 2)).toMatch(/2 AI changes per day/);
});

test("money in the account currency", () => {
  expect(formatMinor(150, "USD")).toBe("$1.50");
  expect(formatMinor(150, "JPY")).toBe("¥150");
});

test("Meta spend strings to minor units, and the budget cycle start", () => {
  expect(toMinor("12.34", "USD")).toBe(1234);
  expect(toMinor("150", "JPY")).toBe(150);
  expect(fromMinor(1234, "USD")).toBe(12.34);
  expect(fromMinor(150, "JPY")).toBe(150);
  expect(cycleStart(new Date("2026-10-22T10:00:00Z"), 1)).toBe("2026-10-01");
  expect(cycleStart(new Date("2026-10-22T10:00:00Z"), 25)).toBe("2026-09-25");
  expect(cycleStart(new Date("2026-01-05T10:00:00Z"), 10)).toBe("2025-12-10");
});
