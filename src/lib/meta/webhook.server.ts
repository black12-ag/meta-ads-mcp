import {
  insertWebhookEvent,
  lastWebhookSyncAt,
  listHandshakes,
  listWebhookEvents,
} from "@/lib/db/sync.server";

/** Topics the app needs subscribed on the Meta app dashboard. */
export const REQUIRED_TOPICS = [
  {
    object: "ad_account",
    field: "in_process_ad_objects",
    why: "Tells us the moment an ad, ad set or campaign is edited or created.",
  },
  {
    object: "ad_account",
    field: "with_issues_ad_objects",
    why: "Surfaces rejections and policy issues so ads don't silently stop.",
  },
  {
    object: "ad_account",
    field: "default_ad_account",
    why: "Catches budget, spend cap and account status changes.",
  },
  {
    object: "page",
    field: "leadgen",
    why: "Delivers lead-form submissions from lead ads in near real time.",
  },
  {
    object: "page",
    field: "messages",
    why: "Needed when ads send people to Messenger or WhatsApp.",
  },
] as const;

export async function webhookStatus(userId: string) {
  const [handshakes, events, lastSync] = await Promise.all([
    listHandshakes(5),
    listWebhookEvents(userId, 15),
    lastWebhookSyncAt(userId),
  ]);

  const lastHandshake = handshakes[0] ?? null;
  const verified = Boolean(lastHandshake && !lastHandshake.error_message);

  return {
    configured: {
      verifyToken: Boolean(process.env["META_WEBHOOK_VERIFY_TOKEN"]),
      appSecret: Boolean(process.env["META_APP_SECRET"]),
    },
    handshake: {
      verified,
      lastAttemptAt: lastHandshake?.created_at ?? null,
      lastError: lastHandshake?.error_message ?? null,
      attempts: handshakes,
    },
    topics: REQUIRED_TOPICS,
    deliveries: events,
    lastWebhookSyncAt: lastSync,
  };
}

/** Record every handshake attempt so the setup page can confirm it worked. */
export async function recordHandshake(ok: boolean, reason?: string) {
  try {
    await insertWebhookEvent({
      object: "handshake",
      field: ok ? "verified" : "rejected",
      payload: {},
      processed_at: new Date().toISOString(),
      error_message: ok ? null : (reason ?? "Verify token did not match"),
    });
  } catch {
    /* never block the handshake on logging */
  }
}
