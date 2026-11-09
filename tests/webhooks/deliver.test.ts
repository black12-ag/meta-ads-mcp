import { createHmac } from "node:crypto";
import { lookup } from "node:dns";
import { request } from "node:https";
import { beforeEach, expect, test, vi } from "vitest";
import {
  deliver,
  downloadPublic,
  isBlockedAddress,
  validateWebhookUrl,
  type WebhookPayload,
} from "@/lib/webhooks/deliver.server";
import { fakeRequest, type Sent } from "./fake-https";

vi.mock("node:https", async (orig) => ({
  ...(await orig<typeof import("node:https")>()),
  request: vi.fn(),
}));
vi.mock("node:dns", async (orig) => ({
  ...(await orig<typeof import("node:dns")>()),
  lookup: vi.fn(),
}));

const event: WebhookPayload = {
  id: "evt_1",
  type: "approval.requested",
  created_at: "2026-10-22T10:00:00.000Z",
  data: { pending_id: "p1" },
  text: "Your AI wants to raise a daily budget.",
};
const hook = (url: string) => ({ url, secret: "whsec_test" });

let sent: Sent[] = [];
beforeEach(() => {
  sent = [];
  vi.mocked(request).mockImplementation(fakeRequest(() => 200, sent));
});

test("URL guard: only https domain names on the standard port", () => {
  for (const bad of [
    "not a url",
    "http://hooks.example.com/x",
    "https://user:pass@hooks.example.com/x",
    "https://hooks.example.com:8443/x",
    "https://127.0.0.1/x",
    "https://10.0.0.8/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data/",
    "https://2130706433/x", // 127.0.0.1 written as one number
    "https://0x7f.0.0.1/x",
    "https://[::1]/x",
    "https://[fd00:ec2::254]/x",
    "https://[::ffff:10.0.0.1]/x",
    "https://localhost/x",
    "https://localhost./x",
    "https://metadata/computeMetadata/v1/",
  ]) {
    expect(validateWebhookUrl(bad), bad).not.toBeNull();
  }
  expect(validateWebhookUrl("https://hooks.slack.com/services/T0/B0/xyz")).toBeNull();
  expect(validateWebhookUrl("https://n8n.example.com:443/webhook/abc?x=1")).toBeNull();
});

test("URL guard: any port only in test mode", () => {
  vi.stubEnv("WEBHOOKS_ALLOW_INSECURE_TEST", "1");
  expect(validateWebhookUrl("https://hooks.example.com:8443/x")).toBeNull();
  expect(validateWebhookUrl("https://127.0.0.1:8443/x")).not.toBeNull();
  vi.unstubAllEnvs();
});

test("address guard: private, loopback, metadata, CGNAT and IPv6 ranges are blocked", () => {
  for (const ip of [
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.10",
    "127.0.0.1",
    "0.0.0.0",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "100.100.100.200", // Alibaba metadata, in CGNAT space
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fd00:ec2::254", // AWS metadata over IPv6
    "fe80::1",
    "ff02::1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "not-an-ip",
  ]) {
    expect(isBlockedAddress(ip), ip).toBe(true);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) {
    expect(isBlockedAddress(ip), ip).toBe(false);
  }
});

test("the address check runs when the socket connects, on every DNS answer", async () => {
  const real = await vi.importActual<typeof import("node:https")>("node:https");
  vi.mocked(request).mockImplementationOnce(real.request);
  // A rebinding name: one public answer, one private.
  const answers = [
    { address: "93.184.215.14", family: 4 },
    { address: "10.0.0.5", family: 4 },
  ];
  vi.mocked(lookup).mockImplementation(((
    _host: string,
    opts: { all?: boolean },
    cb: (...args: unknown[]) => void,
  ) => (opts.all ? cb(null, answers) : cb(null, "10.0.0.5", 4))) as unknown as typeof lookup);

  expect(await deliver(hook("https://rebind.example.com/hook"), event)).toEqual({
    ok: false,
    status: null,
    error: "rebind.example.com points to a private address (10.0.0.5).",
  });
  expect(lookup).toHaveBeenCalled();
});

test("generic endpoints get the event as JSON, signed over the raw body", async () => {
  expect(await deliver(hook("https://api.example.com/hooks/ads"), event)).toEqual({
    ok: true,
    status: 200,
    error: null,
  });
  const [{ headers, body }] = sent;
  expect(JSON.parse(body)).toEqual(event);
  expect(headers["Content-Type"]).toBe("application/json");
  expect(headers["User-Agent"]).toBe("Viral4All-Webhooks/1.0");
  expect(headers["X-Viral4All-Event"]).toBe("approval.requested");
  expect(headers["X-Viral4All-Delivery"]).toMatch(/^[0-9a-f-]{36}$/);
  const [, t, v1] = headers["X-Viral4All-Signature"].match(/^t=(\d+),v1=([0-9a-f]{64})$/) ?? [];
  expect(Math.abs(Number(t) - Date.now() / 1000)).toBeLessThan(5);
  expect(v1).toBe(createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex"));
});

test("Slack and Discord webhooks get their own message shape", async () => {
  for (const url of [
    "https://hooks.slack.com/services/T0/B0/xyz",
    "https://discord.com/api/webhooks/1/abc",
    "https://discordapp.com/api/webhooks/1/abc",
    "https://discord.com/channels/1", // not a Discord webhook
  ]) {
    await deliver(hook(url), event);
  }
  expect(sent.map((s) => JSON.parse(s.body))).toEqual([
    { text: event.text },
    { content: event.text },
    { content: event.text },
    event,
  ]);
});

test("a redirect or an error status is a failed delivery", async () => {
  vi.mocked(request).mockImplementation(
    fakeRequest((url) => (url.pathname === "/moved" ? 301 : 500), sent),
  );
  expect(await deliver(hook("https://api.example.com/moved"), event)).toEqual({
    ok: false,
    status: 301,
    error: "HTTP 301: redirects aren't followed",
  });
  expect(await deliver(hook("https://api.example.com/down"), event)).toEqual({
    ok: false,
    status: 500,
    error: "HTTP 500: nope",
  });
  // a URL that isn't allowed never gets a request
  expect(await deliver(hook("https://10.0.0.1/x"), event)).toMatchObject({ ok: false });
  expect(sent).toHaveLength(2);
});

test("media download: public https only, redirects re-checked, size capped while reading", async () => {
  const { EventEmitter } = await import("node:events");
  const { Readable } = await import("node:stream");
  const answers: Record<string, { status: number; location?: string; body?: string[] }> = {
    "https://cdn.example.com/to-private": { status: 302, location: "http://127.0.0.1:8094/" },
    "https://cdn.example.com/to-file": { status: 301, location: "/file.png" },
    "https://cdn.example.com/file.png": { status: 200, body: ["png", "data"] },
    "https://cdn.example.com/endless": { status: 200, body: ["12345", "67890", "abcde"] },
  };
  vi.mocked(request).mockImplementation(((
    url: URL,
    _o: unknown,
    onResponse: (r: unknown) => void,
  ) =>
    Object.assign(new EventEmitter(), {
      end() {
        const a = answers[url.href];
        onResponse(
          Object.assign(Readable.from((a.body ?? []).map((c) => Buffer.from(c))), {
            statusCode: a.status,
            headers: a.location ? { location: a.location } : { "content-type": "image/png" },
          }),
        );
      },
    })) as unknown as typeof request);

  await expect(downloadPublic("https://169.254.169.254/latest", 100)).rejects.toThrow(
    /domain name/,
  );
  await expect(downloadPublic("https://cdn.example.com/to-private", 100)).rejects.toThrow(/https/);
  const file = await downloadPublic("https://cdn.example.com/to-file", 100);
  expect(Buffer.from(file.bytes).toString()).toBe("pngdata");
  expect(file.contentType).toBe("image/png");
  // no content-length: the cap is enforced while reading
  await expect(downloadPublic("https://cdn.example.com/endless", 8)).rejects.toThrow(/larger/);
});
