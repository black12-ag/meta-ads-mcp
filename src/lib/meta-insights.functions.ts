import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

/** Config + handshake + delivery status for the Meta webhook. */
export const getWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { webhookStatus } = await import("@/lib/meta/webhook.server");
    return webhookStatus(context.userId);
  });

/** Pending / recovered / exhausted retries for this user's syncs. */
export const listSyncRetries = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { retryStatus } = await import("@/lib/meta/retry.server");
    return retryStatus(context.userId);
  });

/** Run any retry of the signed-in user that is due right now, on demand. */
export const runRetryQueue = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { drainRetryQueue } = await import("@/lib/meta/retry.server");
    return drainRetryQueue(5, context.userId);
  });

/** Metric history for one ad, rebuilt from the change log. */
export const getAdTimeline = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({ adId: z.string().min(1), days: z.number().int().min(1).max(90).default(30) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { adTimeline } = await import("@/lib/meta/timeline.server");
    return adTimeline(context.userId, data.adId, data.days);
  });
