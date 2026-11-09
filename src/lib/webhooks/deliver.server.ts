/**
 * Sends one signed webhook message. Server-only.
 * SSRF guard: https on port 443, no IP-literal hosts, and every address DNS returns is checked
 * inside the socket's own lookup, so a DNS answer that changes after the URL was checked
 * (rebinding) still can't reach a private network.
 */
import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { WebhookEvent } from "./events";

const TIMEOUT_MS = 5_000;
const MAX_ANSWER = 4_096;

export interface WebhookPayload {
  id: string;
  type: WebhookEvent | "ping";
  created_at: string;
  data: Record<string, unknown>;
  text: string;
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

// IPv4 rules also match IPv4-mapped IPv6 (::ffff:10.0.0.1), so those need no rules of their own.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // unspecified, "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback, old IPv4-compatible
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True when a webhook must never connect here. Anything that isn't an IP fails closed. */
export function isBlockedAddress(ip: string) {
  const family = isIP(ip);
  return family === 0 || blocked.check(ip, family === 6 ? "ipv6" : "ipv4");
}

/** Why this URL can't take webhooks, or null when it can. DNS is checked later, on connect. */
export function validateWebhookUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter the full URL, starting with https://.";
  }
  if (url.protocol !== "https:") return "The URL must start with https://.";
  if (url.username || url.password) return "Remove the user name and password from the URL.";
  if (url.port && process.env.WEBHOOKS_ALLOW_INSECURE_TEST !== "1") {
    return "Use the standard https port (443).";
  }
  const host = url.hostname.replace(/\.$/, "");
  // Node connects to IP literals without calling lookup, so they'd skip the address check.
  if (isIP(host) || host.startsWith("[")) return "Use a domain name, not an IP address.";
  if (!host.includes(".")) return "Use a public domain name.";
  return null;
}

/** dns.lookup that fails when any answer is a blocked address. Node calls it on every connect. */
const safeLookup: LookupFunction = (hostname, options, callback) =>
  lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const ips = typeof address === "string" ? [address] : address.map((a) => a.address);
    const bad = ips.find(isBlockedAddress);
    if (bad) {
      return callback(
        new Error(`${hostname} points to a private address (${bad}).`),
        address,
        family,
      );
    }
    callback(null, address, family);
  });

/** Slack and Discord webhooks only take their own message shape. */
function bodyFor(url: URL, event: WebhookPayload) {
  if (url.hostname === "hooks.slack.com") return { text: event.text };
  const discord = url.hostname === "discord.com" || url.hostname === "discordapp.com";
  if (discord && url.pathname.startsWith("/api/webhooks/")) {
    return { content: event.text.slice(0, 2000) }; // Discord rejects longer messages
  }
  return event;
}

/** One POST: no redirects, 5 s for the whole exchange, at most ~4 KB of the answer read. */
function post(url: URL, headers: Record<string, string>, body: string) {
  return new Promise<{ status: number; answer: string }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers,
        lookup: safeLookup,
        agent: false, // a fresh socket every time, so no connection skips safeLookup
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      (res) => {
        let answer = "";
        const done = () => resolve({ status: res.statusCode ?? 0, answer });
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          answer = (answer + chunk).slice(0, MAX_ANSWER);
          if (answer.length >= MAX_ANSWER) res.destroy();
        });
        res.on("end", done).on("close", done).on("error", done);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

/** Sends one event to one endpoint. Never throws: failures come back in the result. */
export async function deliver(
  endpoint: { url: string; secret: string },
  event: WebhookPayload,
): Promise<DeliveryResult> {
  const problem = validateWebhookUrl(endpoint.url);
  if (problem) return { ok: false, status: null, error: problem };
  try {
    const url = new URL(endpoint.url);
    const body = JSON.stringify(bodyFor(url, event));
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", endpoint.secret).update(`${t}.${body}`).digest("hex");
    const { status, answer } = await post(
      url,
      {
        "Content-Type": "application/json",
        "User-Agent": "Viral4All-Webhooks/1.0",
        "X-Viral4All-Event": event.type,
        "X-Viral4All-Delivery": randomUUID(),
        "X-Viral4All-Signature": `t=${t},v1=${v1}`,
      },
      body,
    );
    if (status >= 200 && status < 300) return { ok: true, status, error: null };
    const detail =
      status >= 300 && status < 400
        ? "redirects aren't followed"
        : answer.replace(/\s+/g, " ").trim().slice(0, 200);
    return { ok: false, status, error: detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    const message = err instanceof Error ? err.message : "Delivery failed.";
    return { ok: false, status: null, error: timedOut ? "No answer within 5 seconds." : message };
  }
}

/**
 * GET a file from a public https URL with the same SSRF guard as webhooks. Follows up to three
 * redirects, re-checking each one, and stops reading past `maxBytes` instead of buffering it all.
 */
export async function downloadPublic(raw: string, maxBytes: number, redirects = 3) {
  const problem = validateWebhookUrl(raw);
  if (problem) throw new Error(problem);
  const url = new URL(raw);
  return new Promise<{ status: number; contentType: string; bytes: Uint8Array }>(
    (resolve, reject) => {
      const req = request(
        url,
        { lookup: safeLookup, agent: false, signal: AbortSignal.timeout(60_000) },
        (res) => {
          const status = res.statusCode ?? 0;
          const next = res.headers.location;
          if (status >= 300 && status < 400 && next) {
            res.destroy();
            if (redirects <= 0) return reject(new Error("Too many redirects."));
            return downloadPublic(new URL(next, url).href, maxBytes, redirects - 1).then(
              resolve,
              reject,
            );
          }
          if (Number(res.headers["content-length"] ?? 0) > maxBytes) {
            res.destroy();
            return reject(new Error(`File is larger than ${maxBytes / 1024 / 1024} MB.`));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              res.destroy();
              return reject(new Error(`File is larger than ${maxBytes / 1024 / 1024} MB.`));
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({
              status,
              contentType: res.headers["content-type"] ?? "application/octet-stream",
              bytes: new Uint8Array(Buffer.concat(chunks)),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    },
  );
}
