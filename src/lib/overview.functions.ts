import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

/** Live account rollup: KPIs, per-campaign totals and every ad. */
export const getAdsOverview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        datePreset: z.string().min(2).max(32).default("last_30d"),
        accountId: z.string().min(1).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { getConnection } = await import("@/lib/meta/store.server");
    const conn = await getConnection(context.userId);
    if (!conn || !(data.accountId ?? conn.active_ad_account_id)) {
      return { connected: false as const };
    }
    const { adsOverview } = await import("@/lib/meta/overview.server");
    return adsOverview(context.userId, data);
  });

/** Daily account-wide trend rebuilt from the sync change log. */
export const getAccountTimeline = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(180).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { accountTimeline } = await import("@/lib/meta/overview.server");
    return accountTimeline(context.userId, data.days);
  });

/** Clear every Meta connection, mirrored asset and change-log row for the user. */
export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { deleteConnections, deleteAdAccountsByUser, deletePagesByUser } =
      await import("@/lib/db/connections.server");
    const { purgeMetaData } = await import("@/lib/meta/purge.server");
    const { recordAudit } = await import("@/lib/audit.server");

    let error: string | null = null;
    try {
      await deleteConnections(context.userId);
      await deleteAdAccountsByUser(context.userId);
      await deletePagesByUser(context.userId);
      await purgeMetaData(context.userId, "all");
    } catch (err) {
      error = err instanceof Error ? err.message : "Disconnect failed";
    }

    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "connection.disconnect",
      ok: !error,
      error,
    });

    if (error) throw new Error(error);
    return { success: true };
  });
