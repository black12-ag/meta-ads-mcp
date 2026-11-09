/** ad_account_settings: per ad account goals and AI limits. NULL means "no limit". Server-only. */
import { maybeOne, one, q } from "./pool.server";

export interface AccountSettings {
  account_id: string;
  target_cpr_cents: number | null;
  monthly_budget_cents: number | null;
  cycle_start_day: number;
  notes: string | null;
  max_daily_budget_cents: number | null;
  max_raise_pct: number | null;
  max_changes_per_day: number | null;
  protected_ids: string[];
}

export type AccountSettingsInput = Omit<AccountSettings, "account_id">;

const COLUMNS = `account_id, target_cpr_cents, monthly_budget_cents, cycle_start_day, notes,
  max_daily_budget_cents, max_raise_pct, max_changes_per_day, protected_ids`;

export async function getAccountSettings(userId: string, accountId: string) {
  return maybeOne<AccountSettings>(
    `SELECT ${COLUMNS} FROM ad_account_settings WHERE user_id = $1 AND account_id = $2`,
    [userId, accountId],
  );
}

export async function listAccountSettings(userId: string) {
  return q<AccountSettings>(
    `SELECT ${COLUMNS} FROM ad_account_settings WHERE user_id = $1 ORDER BY account_id`,
    [userId],
  );
}

export async function upsertAccountSettings(
  userId: string,
  accountId: string,
  s: AccountSettingsInput,
) {
  return one<AccountSettings>(
    `INSERT INTO ad_account_settings (user_id, account_id, target_cpr_cents, monthly_budget_cents,
       cycle_start_day, notes, max_daily_budget_cents, max_raise_pct, max_changes_per_day, protected_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, account_id) DO UPDATE SET
       target_cpr_cents = EXCLUDED.target_cpr_cents,
       monthly_budget_cents = EXCLUDED.monthly_budget_cents,
       cycle_start_day = EXCLUDED.cycle_start_day,
       notes = EXCLUDED.notes,
       max_daily_budget_cents = EXCLUDED.max_daily_budget_cents,
       max_raise_pct = EXCLUDED.max_raise_pct,
       max_changes_per_day = EXCLUDED.max_changes_per_day,
       protected_ids = EXCLUDED.protected_ids
     RETURNING ${COLUMNS}`,
    [
      userId,
      accountId,
      s.target_cpr_cents,
      s.monthly_budget_cents,
      s.cycle_start_day,
      s.notes,
      s.max_daily_budget_cents,
      s.max_raise_pct,
      s.max_changes_per_day,
      s.protected_ids,
    ],
  );
}

const TODAY = "(now() AT TIME ZONE 'UTC')::date";

/** AI changes counted today (UTC) on this ad account. */
export async function changesToday(userId: string, accountId: string) {
  const row = await maybeOne<{ n: number }>(
    `SELECT n FROM ai_change_counts WHERE user_id = $1 AND account_id = $2 AND day = ${TODAY}`,
    [userId, accountId],
  );
  return row?.n ?? 0;
}

/**
 * Count one AI change, unless `max` are already counted today; false then. One statement, so
 * parallel requests can't slip past the cap. A change that then fails still counts.
 */
export async function takeChangeSlot(userId: string, accountId: string, max: number | null) {
  const row = await maybeOne(
    `INSERT INTO ai_change_counts (user_id, account_id, day, n) VALUES ($1, $2, ${TODAY}, 1)
     ON CONFLICT (user_id, account_id, day) DO UPDATE SET n = ai_change_counts.n + 1
       WHERE $3::int IS NULL OR ai_change_counts.n < $3
     RETURNING n`,
    [userId, accountId, max],
  );
  return row !== null;
}
