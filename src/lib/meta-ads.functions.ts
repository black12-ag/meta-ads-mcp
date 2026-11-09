import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

/** Flat list of every ad with live metrics, budget and status. */
export const listMetaAds = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ datePreset: z.string().min(2).max(32).default("last_30d") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { getConnection } = await import("@/lib/meta/store.server");
    const conn = await getConnection(context.userId);
    if (!conn || !conn.active_ad_account_id) {
      return {
        connected: false as const,
        accountId: "",
        currency: "USD",
        ads: [],
        lastSyncedAt: null,
      };
    }
    const { listAds } = await import("@/lib/meta/actions.server");
    try {
      const result = await listAds(context.userId, { datePreset: data.datePreset });
      return { connected: true as const, ...result };
    } catch (e) {
      if (e instanceof Error && e.message.includes("No Meta account connected")) {
        return {
          connected: false as const,
          accountId: "",
          currency: "USD",
          ads: [],
          lastSyncedAt: null,
        };
      }
      throw e;
    }
  });

/** Pause or resume one ad or a whole selection. */
export const bulkMetaStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(100),
        status: z.enum(["ACTIVE", "PAUSED"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setStatusBulk } = await import("@/lib/meta/actions.server");
    return setStatusBulk(context.userId, data.ids, data.status);
  });

/** Quick inline edit of an ad's destination link (website or WhatsApp). */
export const updateMetaDestination = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        adId: z.string().min(1),
        destination: z.enum(["website", "whatsapp", "facebook_page", "messenger"]),
        destinationValue: z.string().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateAdCreative } = await import("@/lib/meta/actions.server");
    return updateAdCreative(context.userId, data);
  });

/** Recent field-level changes detected during sync or triggered by actions. */
export const listMetaChanges = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        adId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listAdChanges } = await import("@/lib/db/ads.server");
    return listAdChanges(context.userId, { adId: data.adId, limit: data.limit });
  });

/** Run a sync now and report a human-readable failure reason if it breaks. */
export const syncMetaNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { syncUser } = await import("@/lib/meta/sync.server");
    return syncUser(context.userId, "manual");
  });
