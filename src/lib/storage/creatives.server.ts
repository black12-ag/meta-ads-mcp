/**
 * Ad creatives on local disk under CREATIVES_DIR/<userId>/<uuid>.<ext>, served through
 * /api/creatives/* with an HMAC-signed, expiring URL so previews stay private. Server-only.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PATH_RE = /^[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

export function creativesDir() {
  const dir = process.env.CREATIVES_DIR;
  if (!dir) throw new Error("CREATIVES_DIR is not set");
  return dir;
}

function urlSecret() {
  const s = process.env.CREATIVE_URL_SECRET;
  if (!s) throw new Error("CREATIVE_URL_SECRET is not set");
  return s;
}

export function isValidStoragePath(storagePath: string) {
  return PATH_RE.test(storagePath) && !storagePath.includes("..");
}

export async function saveCreative(userId: string, bytes: Uint8Array, ext: string) {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const storagePath = `${userId}/${randomUUID()}.${safeExt}`;
  if (!isValidStoragePath(storagePath)) throw new Error("Invalid storage path");
  const full = path.join(creativesDir(), storagePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { storagePath };
}

function signature(storagePath: string, exp: number) {
  return createHmac("sha256", urlSecret()).update(`${storagePath}:${exp}`).digest("hex");
}

export function signCreativeUrl(storagePath: string, ttlSeconds = 7 * 24 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/creatives/${storagePath}?exp=${exp}&sig=${signature(storagePath, exp)}`;
}

export function verifyCreativeUrl(storagePath: string, exp: string | null, sig: string | null) {
  if (!isValidStoragePath(storagePath) || !exp || !sig) return false;
  const e = Number(exp);
  if (!Number.isInteger(e) || e < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signature(storagePath, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function readCreative(storagePath: string): Promise<Buffer | null> {
  if (!isValidStoragePath(storagePath)) return null;
  try {
    return await readFile(path.join(creativesDir(), storagePath));
  } catch {
    return null;
  }
}

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export function contentTypeFor(storagePath: string) {
  const ext = storagePath.split(".").pop() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}
