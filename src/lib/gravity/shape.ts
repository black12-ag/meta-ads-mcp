/** Pure helpers for the landing "Gravity" field: the V silhouette, the palette and the sphere roles. */

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// The V fills [-1, 1]²: two arms of horizontal half-width V_ARM meet at the bottom (y = -1);
// the arm centres spread to ±V_SPREAD at the top, so the outer edges touch x = ±1.
const V_ARM = 0.2;
const V_SPREAD = 1 - V_ARM;

/** Is (x, y) inside the bold "V"? */
export function inV(x: number, y: number): boolean {
  if (y < -1 || y > 1) return false;
  return Math.abs(Math.abs(x) - (V_SPREAD * (y + 1)) / 2) <= V_ARM;
}

/** A uniform random point inside the V, by rejection sampling. */
export function sampleV(rand: () => number = Math.random): [number, number] {
  for (;;) {
    const x = rand() * 2 - 1;
    const y = rand() * 2 - 1;
    if (inV(x, y)) return [x, y];
  }
}

export const ROLES = ["pastel", "light", "medium", "deep", "glass"] as const;
export type Role = (typeof ROLES)[number];
/** sRGB colors as 0xRRGGBB. */
export type Palette = Record<Role, number>;

export const PALETTES = {
  violet: { pastel: 0xf3eeff, light: 0xc4b5fd, medium: 0x7c3aed, deep: 0x4c1d95, glass: 0xa78bfa },
  blue: { pastel: 0xeef4ff, light: 0xbfd4ff, medium: 0x3b82f6, deep: 0x1e3a8a, glass: 0x93c5fd },
  pink: { pastel: 0xfff0f7, light: 0xfbcfe8, medium: 0xec4899, deep: 0x9d174d, glass: 0xf9a8d4 },
} satisfies Record<string, Palette>;

function mix(a: number, b: number, t: number): number {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

/** The palette at scroll progress p: violet hero, then electric blue, then pink. */
export function paletteAt(p: number): Palette {
  const toBlue = smoothstep(0.55, 1.05, p);
  const toPink = smoothstep(1.4, 1.95, p);
  const out = {} as Palette;
  for (const role of ROLES) {
    const { violet, blue, pink } = PALETTES;
    out[role] = mix(mix(violet[role], blue[role], toBlue), pink[role], toPink);
  }
  return out;
}

// Cumulative split of the matte spheres: 25% pastel, 30% light, 30% medium, 15% deep.
const MATTE_SPLIT: [Role, number][] = [
  ["pastel", 0.25],
  ["light", 0.55],
  ["medium", 0.85],
  ["deep", 1],
];

/** One role per sphere: 22% glass, the rest matte by MATTE_SPLIT, shuffled. */
export function sphereRoles(count: number, rand: () => number = Math.random): Role[] {
  const glass = Math.round(count * 0.22);
  const matte = count - glass;
  const roles: Role[] = Array.from({ length: glass }, () => "glass");
  for (let j = 0; j < matte; j++) {
    roles.push(MATTE_SPLIT.find(([, upTo]) => (j + 0.5) / matte < upTo)![0]);
  }
  // Sizes are assigned by index, so shuffle to keep roles and sizes independent.
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}
