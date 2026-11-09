/**
 * Deletes what came from Meta for these ad accounts, or for all of the user's accounts: copied
 * ads, detected changes, approval requests (they hold Meta names and before-states), alerts,
 * checks and the daily change counts. Goals & limits are the owner's own settings, so they stay
 * unless `settings` is set: an in-app reconnect must not silently drop them. Server-only.
 */
import {
  deleteAdChangesByAccounts,
  deleteAdChangesByUser,
  deleteSavedAdsByAccounts,
  deleteSavedAdsByUser,
} from "@/lib/db/ads.server";
import { q } from "@/lib/db/pool.server";
import {
  deleteRetriesByUser,
  deleteSyncRunsByUser,
  deleteWebhookEventsByUser,
} from "@/lib/db/sync.server";

const PER_ACCOUNT = ["mcp_pending_actions", "account_alerts", "account_checks", "ai_change_counts"];

export async function purgeMetaData(
  userId: string,
  accountIds: string[] | "all",
  opts: { settings?: boolean } = {},
) {
  const tables = opts.settings ? [...PER_ACCOUNT, "ad_account_settings"] : PER_ACCOUNT;
  if (accountIds === "all") {
    for (const t of tables) await q(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
    await deleteSavedAdsByUser(userId);
    await deleteAdChangesByUser(userId);
    await deleteSyncRunsByUser(userId);
    await deleteRetriesByUser(userId);
    await deleteWebhookEventsByUser(userId);
    return;
  }
  if (!accountIds.length) return;
  for (const t of tables) {
    await q(`DELETE FROM ${t} WHERE user_id = $1 AND account_id = ANY($2)`, [userId, accountIds]);
  }
  await deleteSavedAdsByAccounts(userId, accountIds);
  await deleteAdChangesByAccounts(userId, accountIds);
}
