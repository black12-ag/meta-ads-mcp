import { expect, test } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

test("keeps same-site paths, including the OAuth consent page with its query", () => {
  expect(safeNext("/dashboard")).toBe("/dashboard");
  expect(safeNext("/oauth/authorize?client_id=x&state=1")).toBe(
    "/oauth/authorize?client_id=x&state=1",
  );
});

test("rejects anything a browser could send to another site", () => {
  for (const bad of [
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "https://evil.com",
    "/\tevil",
    "evil",
    42,
    null,
  ]) {
    expect(safeNext(bad), String(bad)).toBeUndefined();
  }
});
