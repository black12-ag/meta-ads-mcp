import { describe, expect, it } from "vitest";
import { PLATFORM_MARKS, SHOW_UPCOMING, isRequestableSource } from "@/lib/platform-marks";

describe("source notify-me requests", () => {
  it("accepts only planned sources, and none while they are hidden", () => {
    expect(isRequestableSource("linkedin")).toBe(SHOW_UPCOMING);
    expect(isRequestableSource("google_ads")).toBe(SHOW_UPCOMING);
    expect(isRequestableSource("meta")).toBe(false);
    expect(isRequestableSource("instagram")).toBe(false);
    expect(isRequestableSource("nope")).toBe(false);
    expect(isRequestableSource("linkedin' OR 1=1")).toBe(false);
  });

  it("shows only Meta (and its Instagram placement) while the other platforms are hidden", () => {
    if (!SHOW_UPCOMING) for (const m of PLATFORM_MARKS) expect(m.platform).toBe("meta");
  });

  it("gives every source a status and a unique id", () => {
    const ids = PLATFORM_MARKS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of PLATFORM_MARKS) expect(["live", "soon"]).toContain(m.status);
  });
});
