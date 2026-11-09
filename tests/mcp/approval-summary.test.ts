import { expect, test } from "vitest";
import { approvalHeadline, canQuickApprove, requesterLabel } from "@/lib/approval-summary";

test("headlines say exactly what will change", () => {
  expect(
    approvalHeadline("budget", {
      object: { id: "1", name: "ShegerPay — Traffic" },
      budget: "daily",
      from: "$1.00",
      to: "$25.00",
    }),
  ).toBe("ShegerPay — Traffic: daily budget $1.00 → $25.00");
  expect(
    approvalHeadline("resume", {
      objects: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    }),
  ).toBe("Start delivering again: A, B, C and 1 more");
  expect(approvalHeadline("creative", { ad: { name: "Promo" }, changes: { headline: "x" } })).toBe(
    "Promo: new headline",
  );
  expect(
    approvalHeadline("creative", {
      ad: { name: "Promo" },
      changes: [
        { field: "headline", from: "a", to: "b" },
        { field: "primaryText", from: null, to: "c" },
      ],
    }),
  ).toBe("Promo: new headline, primaryText");
  expect(approvalHeadline("pause", { objects: [{ name: "Spring sale" }] })).toBe(
    "Stop spending: Spring sale",
  );
});

test("requester labels come from the typed value, so an app name cannot pose as a key", () => {
  expect(requesterLabel("app:Claude")).toBe("connected app “Claude”");
  expect(requesterLabel("key:sk_meta_Ng60MQLj")).toBe("API key sk_meta_Ng60MQLj…");
  expect(requesterLabel("app:sk_meta_fake")).toBe("connected app “sk_meta_fake”");
  expect(requesterLabel("sk_meta_untyped")).toBe("your AI assistant");
  expect(requesterLabel(null)).toBe("your AI assistant");
});

test("one-click approve only when the headline shows the whole change", () => {
  expect(canQuickApprove("budget", {})).toBe(true);
  expect(canQuickApprove("resume", { objects: [{}, {}, {}] })).toBe(true);
  expect(canQuickApprove("resume", { objects: [{}, {}, {}, {}] })).toBe(false);
  expect(canQuickApprove("creative", { changes: { headline: "x" } })).toBe(false);
});
