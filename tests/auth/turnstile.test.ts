import { expect, test } from "vitest";
import { verifyTurnstile } from "@/lib/auth/turnstile.server";

const answer = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("passes only when Cloudflare says success", async () => {
  expect(await verifyTurnstile("tok", "s", "1.2.3.4", answer({ success: true }))).toBe(true);
  expect(await verifyTurnstile("tok", "s", null, answer({ success: false }))).toBe(false);
  expect(await verifyTurnstile("tok", "s", null, answer({ success: true }, 500))).toBe(false);
});

test("fails closed on an empty token or a network error", async () => {
  expect(await verifyTurnstile("", "s", null, answer({ success: true }))).toBe(false);
  const down = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  expect(await verifyTurnstile("tok", "s", null, down)).toBe(false);
});

test("sends the secret, token and visitor IP", async () => {
  let sent = "";
  const spy = (async (_url: string, init: RequestInit) => {
    sent = String(init.body);
    return new Response(JSON.stringify({ success: true }));
  }) as unknown as typeof fetch;
  await verifyTurnstile("tok", "sec", "9.9.9.9", spy);
  expect(sent).toBe("secret=sec&response=tok&remoteip=9.9.9.9");
});
