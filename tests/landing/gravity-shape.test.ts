import { expect, test } from "vitest";
import { inV, paletteAt, PALETTES, ROLES, sampleV, sphereRoles } from "@/lib/gravity/shape";

test("the V has two arms that meet at the bottom and a notch between them", () => {
  // inside: the joined bottom, and the middle and top of both arms
  for (const [x, y] of [
    [0, -0.95],
    [0.38, 0],
    [-0.38, 0],
    [0.72, 0.9],
    [-0.72, 0.9],
  ]) {
    expect(inV(x, y), `(${x}, ${y})`).toBe(true);
  }
  // outside: the notch, beside the bottom, past the top, past the sides
  for (const [x, y] of [
    [0, 0.5],
    [0, 0.95],
    [0.6, -0.9],
    [0.72, 1.05],
    [1.05, 0.9],
    [0, -1.05],
  ]) {
    expect(inV(x, y), `(${x}, ${y})`).toBe(false);
  }
});

test("sampled shape targets land inside the V, on both arms", () => {
  const points = Array.from({ length: 500 }, () => sampleV());
  expect(points.every(([x, y]) => inV(x, y))).toBe(true);
  expect(points.some(([x, y]) => x < -0.3 && y > 0.3)).toBe(true);
  expect(points.some(([x, y]) => x > 0.3 && y > 0.3)).toBe(true);
});

test("the palette has every role and morphs violet, then blue, then pink", () => {
  for (const p of [0, 0.8, 1.2, 1.7, 2.5]) {
    const palette = paletteAt(p);
    expect(Object.keys(palette).sort()).toEqual([...ROLES].sort());
    for (const color of Object.values(palette)) {
      expect(Number.isInteger(color) && color >= 0 && color <= 0xffffff).toBe(true);
    }
  }
  expect(paletteAt(0)).toEqual(PALETTES.violet);
  expect(paletteAt(1.2)).toEqual(PALETTES.blue);
  expect(paletteAt(2.5)).toEqual(PALETTES.pink);
  // halfway to blue sits between the two mediums
  const mid = paletteAt(0.8).medium;
  expect(mid).not.toBe(PALETTES.violet.medium);
  expect(mid).not.toBe(PALETTES.blue.medium);
});

test("sphere roles: 22% glass and every matte role present", () => {
  for (const count of [96, 54]) {
    const roles = sphereRoles(count);
    expect(roles).toHaveLength(count);
    const tally = (role: string) => roles.filter((r) => r === role).length;
    expect(tally("glass")).toBe(Math.round(count * 0.22));
    for (const role of ["pastel", "light", "medium", "deep"])
      expect(tally(role)).toBeGreaterThan(0);
  }
  const matte = sphereRoles(96).filter((r) => r !== "glass");
  expect(matte.filter((r) => r === "deep").length / matte.length).toBeCloseTo(0.15, 1);
});

test("source arc angles wrap into -180..180 and step evenly", async () => {
  const { arcAngle } = await import("@/components/landing/SourceArc");
  expect(arcAngle(0, 0)).toBe(0);
  const step = arcAngle(1, 0);
  expect(step).toBeGreaterThan(0);
  for (let i = 0; i < 40; i++) {
    for (const offset of [0, 13.7, 359, 721, -45]) {
      const a = arcAngle(i, offset);
      expect(a).toBeGreaterThanOrEqual(-180);
      expect(a).toBeLessThan(180);
    }
  }
  expect(arcAngle(3, 3 * step)).toBeCloseTo(0);
});
