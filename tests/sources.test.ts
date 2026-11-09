import { describe, expect, it } from "vitest";
import { PLATFORM_MARKS, isRequestableSource } from "@/lib/platform-marks";

describe("source notify-me requests", () => {
  it("accepts only sources that are coming soon", () => {
    expect(isRequestableSource("linkedin")).toBe(true);
    expect(isRequestableSource("google_ads")).toBe(true);
    expect(isRequestableSource("meta")).toBe(false);
    expect(isRequestableSource("instagram")).toBe(false);
    expect(isRequestableSource("nope")).toBe(false);
    expect(isRequestableSource("linkedin' OR 1=1")).toBe(false);
  });

  it("gives every source a status and a unique id", () => {
    const ids = PLATFORM_MARKS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of PLATFORM_MARKS) expect(["live", "soon"]).toContain(m.status);
  });
});
