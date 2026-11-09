import { fetchCampaignTree } from "./ads.server";
import { mirrorAds } from "./mirror.server";
import { getPrimaryConnection, listConnectionsForSync } from "@/lib/db/connections.server";
import { insertSyncRun } from "@/lib/db/sync.server";

export interface SyncOutcome {
  userId: string;
  accountId: string | null;
  status: "ok" | "error" | "skipped";
  adsSynced: number;
  changes?: number;
  error?: string;
  errorKind?: "permission" | "token" | "rate_limit" | "network" | "unknown";
  retry?: { attempts: number; nextAttemptAt: string; exhausted: boolean };
}

/** Turn a raw Meta/Graph failure into something a person can act on. */
export function classifyError(message: string): NonNullable<SyncOutcome["errorKind"]> {
  const m = message.toLowerCase();
  if (m.includes("permission") || m.includes("(#200") || m.includes("403")) return "permission";
  if (m.includes("expired") || m.includes("session has been invalidated") || m.includes("(#190"))
    return "token";
  if (m.includes("rate limit") || m.includes("too many calls") || m.includes("(#17"))
    return "rate_limit";
  if (m.includes("fetch") || m.includes("network") || m.includes("timeout")) return "network";
  return "unknown";
}

/** Refresh insights for one connection and record the run. */
export async function syncConnection(
  conn: {
    user_id: string;
    access_token: string;
    active_ad_account_id: string | null;
    active_page_id: string | null;
  },
  source: string,
): Promise<SyncOutcome> {
  const accountId = conn.active_ad_account_id;

  if (!accountId) {
    return { userId: conn.user_id, accountId: null, status: "skipped", adsSynced: 0 };
  }

  try {
    // "maximum" so the mirrored lifetime_* columns really are lifetime totals. With a rolling
    // window they could go down between syncs, which made the change log and timelines nonsense.
    const campaigns = await fetchCampaignTree(conn.access_token, accountId, "maximum");
    const { mirrored, changes } = await mirrorAds(
      conn.user_id,
      accountId,
      conn.active_page_id,
      campaigns,
      source,
    );
    await insertSyncRun({
      user_id: conn.user_id,
      ad_account_id: accountId,
      ads_synced: mirrored,
      status: "ok",
      source,
    });
    const { clearRetry } = await import("./retry.server");
    await clearRetry(conn.user_id);
    // Daily alerts and budget guard: in the background, and never a reason for the sync to fail.
    void import("@/lib/alerts/check.server")
      .then((m) => m.runAccountChecks(conn.user_id, accountId, campaigns))
      .catch((err) => console.error(`[alerts] ${accountId}: ${err}`));
    return { userId: conn.user_id, accountId, status: "ok", adsSynced: mirrored, changes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    await insertSyncRun({
      user_id: conn.user_id,
      ad_account_id: accountId,
      ads_synced: 0,
      status: "error",
      source,
      error_message: message.slice(0, 500),
    });
    const outcome: SyncOutcome = {
      userId: conn.user_id,
      accountId,
      status: "error",
      adsSynced: 0,
      error: message,
      errorKind: classifyError(message),
    };
    if (outcome.errorKind === "token" || outcome.errorKind === "permission") {
      const { notifyMetaNeedsReconnect } = await import("@/lib/email/notify.server");
      void notifyMetaNeedsReconnect(conn.user_id, {
        reason:
          outcome.errorKind === "token"
            ? "Your Meta login expired or was removed, so we can't read your ads right now."
            : "Meta no longer gives us a permission we need to read your ads.",
      });
    }
    const { scheduleRetry } = await import("./retry.server");
    const retry = await scheduleRetry(outcome, source);
    return retry ? { ...outcome, retry } : outcome;
  }
}

/** Sync the user's primary login — used by the webhook, the public API, MCP and the dashboard. */
export async function syncUser(userId: string, source: string): Promise<SyncOutcome> {
  const conn = await getPrimaryConnection(userId);
  if (!conn) return { userId, accountId: null, status: "skipped", adsSynced: 0 };
  return syncConnection(conn, source);
}

/** Sweep every connected account. Used by the scheduled sync endpoint. */
export async function syncAllConnections(source = "cron") {
  const connections = await listConnectionsForSync();
  const results: SyncOutcome[] = [];
  for (const conn of connections) {
    results.push(await syncConnection(conn, source));
  }
  return {
    connections: results.length,
    synced: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  };
}
