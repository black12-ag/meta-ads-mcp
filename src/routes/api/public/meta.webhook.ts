import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta pushes ad-account changes here. We verify the app-secret signature,
 * record the event and kick off a targeted re-sync so numbers stay near-live.
 */
async function verifySignature(raw: string, header: string | null) {
  const secret = process.env["META_APP_SECRET"];
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

type WebhookEntry = { id?: string | number; changes?: Array<{ field?: string }> };

export const Route = createFileRoute("/api/public/meta/webhook")({
  server: {
    handlers: {
      // Meta's subscription handshake.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = process.env["META_WEBHOOK_VERIFY_TOKEN"];
        const { recordHandshake } = await import("@/lib/meta/webhook.server");
        if (
          url.searchParams.get("hub.mode") === "subscribe" &&
          token &&
          url.searchParams.get("hub.verify_token") === token
        ) {
          await recordHandshake(true);
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        await recordHandshake(
          false,
          !token ? "META_WEBHOOK_VERIFY_TOKEN is not configured" : "Verify token did not match",
        );
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256")))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: { object?: string; entry?: WebhookEntry[] };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const { findUsersByActiveAccount } = await import("@/lib/db/connections.server");
        const { insertWebhookEvent } = await import("@/lib/db/sync.server");
        const { syncUser } = await import("@/lib/meta/sync.server");

        const entries = Array.isArray(payload.entry) ? payload.entry : [];
        const touched = new Set<string>();

        for (const entry of entries) {
          const accountId = String(entry.id ?? "").replace(/^act_/, "");
          const userIds = await findUsersByActiveAccount(accountId);
          for (const userId of userIds) {
            await insertWebhookEvent({
              user_id: userId,
              object: String(payload.object ?? "ad_account"),
              field: entry.changes?.[0]?.field ?? null,
              payload: entry,
              processed_at: new Date().toISOString(),
            });
            touched.add(userId);
          }
        }

        // Acknowledge first; the sync runs after the response is on its way.
        const work = (async () => {
          for (const userId of touched) {
            try {
              await syncUser(userId, "webhook");
            } catch {
              /* the sync run row already captured the failure */
            }
          }
        })();
        void work;

        return new Response("EVENT_RECEIVED", { status: 200 });
      },
    },
  },
});
