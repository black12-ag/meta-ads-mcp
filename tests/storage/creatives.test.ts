import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import {
  contentTypeFor,
  readCreative,
  saveCreative,
  signCreativeUrl,
  verifyCreativeUrl,
} from "@/lib/storage/creatives.server";

test("saves under CREATIVES_DIR/<user>/<uuid>.<ext> and reads it back", async () => {
  const { storagePath } = await saveCreative("user1", new Uint8Array([1, 2, 3]), "PNG");
  expect(storagePath).toMatch(/^user1\/[0-9a-f-]{36}\.png$/);
  expect(existsSync(path.join(process.env.CREATIVES_DIR!, storagePath))).toBe(true);
  expect([...(await readCreative(storagePath))!]).toEqual([1, 2, 3]);
  expect(contentTypeFor(storagePath)).toBe("image/png");
});

test("signed urls verify, tampering and expiry are rejected", async () => {
  const { storagePath } = await saveCreative("user1", new Uint8Array([9]), "mp4");
  const url = new URL(signCreativeUrl(storagePath), "http://x");
  expect(url.pathname).toBe(`/api/creatives/${storagePath}`);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  expect(verifyCreativeUrl(storagePath, exp, sig)).toBe(true);
  const tampered = (sig![0] === "a" ? "b" : "a") + sig!.slice(1); // always differs from sig
  expect(verifyCreativeUrl(storagePath, exp, tampered)).toBe(false);
  expect(verifyCreativeUrl(storagePath, String(Number(exp) - 10 * 24 * 3600), sig)).toBe(false);
  expect(verifyCreativeUrl("../etc/passwd", exp, sig)).toBe(false);
  expect(verifyCreativeUrl(storagePath, null, sig)).toBe(false);
});

test("reads outside the store are refused", async () => {
  expect(await readCreative("../../etc/hosts")).toBeNull();
  expect(await readCreative("user1/does-not-exist.png")).toBeNull();
});
