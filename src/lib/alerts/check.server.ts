/**
 * The daily account check, run in the background after a successful sync: one Graph call for daily
 * insights, the rules in ./rules, then the findings are stored and emailed. When the monthly budget
 * is used up it asks the owner to approve pausing the active campaigns. Runs at most once per ad
 * account per day (the account's own calendar day) and never throws. Server-only.
 */
import { getAccountSettings } from "@/lib/db/account-settings.server";
import { findAdAccount, getConnectionToken } from "@/lib/db/connections.server";
import { maybeOne, q, values } from "@/lib/db/pool.server";
import { notifyAccountAlerts } from "@/lib/email/notify.server";
import { graphGet, graphGetAll, publicOrigin } from "@/lib/meta/graph.server";
import {
  accountFindings,
  activeCampaignIds,
  addDays,
  type CampaignState,
  type InsightRow,
} from "./rules";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Today (YYYY-MM-DD) in the account's time zone, which is how Meta splits daily insights. */
function localDay(timeZone: string | null) {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timeZone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** campaigns: the tree the sync just fetched, for ad and campaign statuses. */
export async function runAccountChecks(
  userId: string,
  accountId: string,
  campaigns: CampaignState[],
) {
  try {
    const account = await findAdAccount(userId, accountId);
    if (!account) return null;
    const today = localDay(account.timezone_name);
    const claimed = await maybeOne(
      `INSERT INTO account_checks (user_id, account_id, day) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING account_id`,
      [userId, accountId, today],
    );
    if (!claimed) return null;

    let rows: InsightRow[];
    let accountStatus = account.account_status;
    try {
      const token = await getConnectionToken(account.connection_id);
      if (!token) throw new Error("The Meta login for this ad account is gone.");
      // The stored status is only refreshed when assets sync, so read it fresh.
      const fresh = await graphGet<{ account_status?: number }>(`act_${accountId}`, token, {
        fields: "account_status",
      });
      accountStatus = fresh.account_status ?? accountStatus;
      rows = await graphGetAll<InsightRow>(`act_${accountId}/insights`, token, {
        fields: "spend,impressions,clicks,actions",
        time_increment: 1,
        // 30 days back covers the 4 baseline weeks and the longest budget cycle.
        time_range: JSON.stringify({ since: addDays(today, -30), until: today }),
      });
    } catch (err) {
      // Free the day so a later sync can try again.
      await q("DELETE FROM account_checks WHERE user_id = $1 AND account_id = $2 AND day = $3", [
        userId,
        accountId,
        today,
      ]);
      throw err;
    }

    const findings = accountFindings({
      today,
      currency: account.currency,
      rows,
      accountStatus,
      campaigns,
      goals: await getAccountSettings(userId, accountId),
    });
    if (!findings.length) return findings;

    const budget = findings.find((f) => f.kind === "monthly_budget" && f.severity === "critical");
    const ids = activeCampaignIds(campaigns);
    let pauseRequested = false;
    if (budget && ids.length) {
      try {
        const { proposePause } = await import("@/lib/mcp/confirm.server");
        await proposePause(
          {
            userId,
            base: publicOrigin("https://ads.viral4all.com"),
            requester: "app:Budget guard",
          },
          ids,
          budget.detail,
        );
        budget.detail += ` A request to pause ${ids.length} active campaign${ids.length === 1 ? "" : "s"} is waiting for your approval.`;
        pauseRequested = true;
      } catch (err) {
        console.error(`[alerts] ${accountId} pause request failed: ${errorText(err)}`);
      }
    }

    const { text, params } = values(
      findings.map((f) => [userId, accountId, f.kind, f.severity, f.title, f.detail]),
    );
    await q(
      `INSERT INTO account_alerts (user_id, account_id, kind, severity, title, detail) VALUES ${text}`,
      params,
    );
    await notifyAccountAlerts(userId, {
      accountId,
      accountName: account.name,
      day: today,
      findings,
      pauseRequested,
    });
    const { emitEvent } = await import("@/lib/webhooks/store.server");
    emitEvent(
      userId,
      "alert.created",
      {
        account_id: accountId,
        account_name: account.name,
        day: today,
        findings,
        pause_requested: pauseRequested,
      },
      `${account.name}: ${findings.map((f) => f.title).join("; ")}. ${publicOrigin("https://ads.viral4all.com")}/dashboard`,
    );
    return findings;
  } catch (err) {
    console.error(`[alerts] ${accountId} check failed: ${errorText(err)}`);
    return null;
  }
}

/** The Home card: the latest alert of each kind per account from the last 7 days, at most 10. */
export function recentAlerts(userId: string) {
  return q<{
    id: string;
    severity: "warn" | "critical";
    title: string;
    detail: string | null;
    created_at: string;
  }>(
    `SELECT * FROM (
       SELECT DISTINCT ON (account_id, kind) id, severity, title, detail, created_at
       FROM account_alerts WHERE user_id = $1 AND created_at > now() - interval '7 days'
       ORDER BY account_id, kind, created_at DESC
     ) latest
     ORDER BY created_at DESC, severity = 'critical' DESC LIMIT 10`,
    [userId],
  );
}
