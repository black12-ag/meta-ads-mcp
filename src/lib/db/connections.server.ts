/** meta_connections, meta_ad_accounts, meta_pages, meta_oauth_states. Server-only. */
import { maybeOne, one, q, transaction, values } from "./pool.server";
import { decryptToken, encryptToken } from "./token-crypto.server";

/** access_token is encrypted in the table; every row leaving this module carries plaintext. */
function withToken<T extends { access_token: string }>(row: T): T {
  return { ...row, access_token: decryptToken(row.access_token) };
}

export interface ConnectionRow {
  id: string;
  user_id: string;
  meta_user_id: string;
  meta_name: string | null;
  meta_picture_url: string | null;
  access_token: string;
  token_expires_at: string | null;
  scopes: string[];
  active_ad_account_id: string | null;
  active_page_id: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export type ConnectionSummary = Pick<
  ConnectionRow,
  | "id"
  | "meta_user_id"
  | "meta_name"
  | "meta_picture_url"
  | "token_expires_at"
  | "is_primary"
  | "created_at"
>;

export type ConnectionForSync = Pick<
  ConnectionRow,
  "user_id" | "access_token" | "active_ad_account_id" | "active_page_id"
>;

/** The login in focus: primary first, then oldest. */
export async function getPrimaryConnection(userId: string) {
  const row = await maybeOne<ConnectionRow>(
    `SELECT * FROM meta_connections WHERE user_id = $1
     ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    [userId],
  );
  return row && withToken(row);
}

export async function listConnections(userId: string) {
  return q<ConnectionSummary>(
    `SELECT id, meta_user_id, meta_name, meta_picture_url, token_expires_at, is_primary, created_at
     FROM meta_connections WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
}

export async function upsertConnection(row: {
  user_id: string;
  meta_user_id: string;
  meta_name: string | null;
  meta_picture_url: string | null;
  access_token: string;
  token_expires_at: string | null;
}) {
  const saved = await one<ConnectionRow>(
    `INSERT INTO meta_connections (user_id, meta_user_id, meta_name, meta_picture_url, access_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, meta_user_id) DO UPDATE SET
       meta_name = EXCLUDED.meta_name,
       meta_picture_url = EXCLUDED.meta_picture_url,
       access_token = EXCLUDED.access_token,
       token_expires_at = EXCLUDED.token_expires_at
     RETURNING *`,
    [
      row.user_id,
      row.meta_user_id,
      row.meta_name,
      row.meta_picture_url,
      encryptToken(row.access_token),
      row.token_expires_at,
    ],
  );
  return withToken(saved);
}

/** Make one login primary and every other login of the user non-primary. */
export async function setPrimaryConnection(userId: string, id: string) {
  await transaction(async (run) => {
    await run(`UPDATE meta_connections SET is_primary = false WHERE user_id = $1`, [userId]);
    await run(`UPDATE meta_connections SET is_primary = true WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ]);
  });
}

export async function updateConnection(
  id: string,
  patch: Partial<Pick<ConnectionRow, "active_ad_account_id" | "active_page_id" | "is_primary">>,
) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const key of ["active_ad_account_id", "active_page_id", "is_primary"] as const) {
    if (key in patch) {
      params.push(patch[key] ?? null);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return;
  await q(`UPDATE meta_connections SET ${sets.join(", ")} WHERE id = $1`, params);
}

/** Delete one login (when id is given) or every login of the user. Ad accounts and pages cascade. */
export async function deleteConnections(userId: string, id?: string) {
  if (id) await q(`DELETE FROM meta_connections WHERE user_id = $1 AND id = $2`, [userId, id]);
  else await q(`DELETE FROM meta_connections WHERE user_id = $1`, [userId]);
}

export async function listConnectionsForSync() {
  const rows = await q<ConnectionForSync>(
    `SELECT user_id, access_token, active_ad_account_id, active_page_id FROM meta_connections`,
  );
  return rows.map(withToken);
}

export async function findConnectionsByMetaUser(metaUserId: string) {
  return q<Pick<ConnectionRow, "id" | "user_id">>(
    `SELECT id, user_id FROM meta_connections WHERE meta_user_id = $1`,
    [metaUserId],
  );
}

export async function findUsersByActiveAccount(accountId: string) {
  const rows = await q<{ user_id: string }>(
    `SELECT user_id FROM meta_connections WHERE active_ad_account_id = $1`,
    [accountId],
  );
  return rows.map((r) => r.user_id);
}

export async function getConnectionToken(id: string) {
  const row = await maybeOne<{ access_token: string }>(
    `SELECT access_token FROM meta_connections WHERE id = $1`,
    [id],
  );
  return row ? decryptToken(row.access_token) : null;
}

// ---- ad accounts ----

export interface AdAccountRow {
  id: string;
  user_id: string;
  connection_id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone_name: string | null;
  account_status: number | null;
  spend_cap_cents: number | null;
  amount_spent_cents: number | null;
  business_name: string | null;
  created_at: string;
  updated_at: string;
}

export type AdAccountInput = Omit<AdAccountRow, "id" | "created_at" | "updated_at">;

export async function upsertAdAccounts(rows: AdAccountInput[]) {
  if (!rows.length) return;
  const { text, params } = values(
    rows.map((a) => [
      a.user_id,
      a.connection_id,
      a.account_id,
      a.name,
      a.currency,
      a.timezone_name,
      a.account_status,
      a.spend_cap_cents,
      a.amount_spent_cents,
      a.business_name,
    ]),
  );
  await q(
    `INSERT INTO meta_ad_accounts
       (user_id, connection_id, account_id, name, currency, timezone_name, account_status,
        spend_cap_cents, amount_spent_cents, business_name)
     VALUES ${text}
     ON CONFLICT (user_id, account_id) DO UPDATE SET
       connection_id = EXCLUDED.connection_id, name = EXCLUDED.name, currency = EXCLUDED.currency,
       timezone_name = EXCLUDED.timezone_name, account_status = EXCLUDED.account_status,
       spend_cap_cents = EXCLUDED.spend_cap_cents, amount_spent_cents = EXCLUDED.amount_spent_cents,
       business_name = EXCLUDED.business_name`,
    params,
  );
}

export async function listAdAccounts(userId: string) {
  return q<AdAccountRow>(`SELECT * FROM meta_ad_accounts WHERE user_id = $1 ORDER BY name`, [
    userId,
  ]);
}

export async function findAdAccount(userId: string, accountId: string) {
  return maybeOne<AdAccountRow>(
    `SELECT * FROM meta_ad_accounts WHERE user_id = $1 AND account_id = $2`,
    [userId, accountId],
  );
}

export async function firstAdAccountForConnection(userId: string, connectionId: string) {
  return maybeOne<{ account_id: string }>(
    `SELECT account_id FROM meta_ad_accounts WHERE user_id = $1 AND connection_id = $2
     ORDER BY created_at ASC LIMIT 1`,
    [userId, connectionId],
  );
}

export async function deleteAdAccountsByUser(userId: string) {
  await q(`DELETE FROM meta_ad_accounts WHERE user_id = $1`, [userId]);
}

// ---- pages ----

export interface PageRow {
  id: string;
  user_id: string;
  connection_id: string;
  page_id: string;
  name: string;
  category: string | null;
  picture_url: string | null;
  tasks: string[];
  instagram_business_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PageInput = Omit<PageRow, "id" | "created_at" | "updated_at">;

export async function upsertPages(rows: PageInput[]) {
  if (!rows.length) return;
  const { text, params } = values(
    rows.map((p) => [
      p.user_id,
      p.connection_id,
      p.page_id,
      p.name,
      p.category,
      p.picture_url,
      p.tasks,
      p.instagram_business_id,
    ]),
  );
  await q(
    `INSERT INTO meta_pages
       (user_id, connection_id, page_id, name, category, picture_url, tasks, instagram_business_id)
     VALUES ${text}
     ON CONFLICT (user_id, page_id) DO UPDATE SET
       connection_id = EXCLUDED.connection_id, name = EXCLUDED.name, category = EXCLUDED.category,
       picture_url = EXCLUDED.picture_url, tasks = EXCLUDED.tasks,
       instagram_business_id = EXCLUDED.instagram_business_id`,
    params,
  );
}

export async function listPages(userId: string) {
  return q<PageRow>(`SELECT * FROM meta_pages WHERE user_id = $1 ORDER BY name`, [userId]);
}

export async function firstPageForConnection(userId: string, connectionId: string) {
  return maybeOne<{ page_id: string }>(
    `SELECT page_id FROM meta_pages WHERE user_id = $1 AND connection_id = $2
     ORDER BY created_at ASC LIMIT 1`,
    [userId, connectionId],
  );
}

export async function deletePagesByUser(userId: string) {
  await q(`DELETE FROM meta_pages WHERE user_id = $1`, [userId]);
}

// ---- oauth states ----

export async function insertOauthState(state: string, userId: string, redirectUri: string) {
  await q(`INSERT INTO meta_oauth_states (state, user_id, redirect_uri) VALUES ($1, $2, $3)`, [
    state,
    userId,
    redirectUri,
  ]);
}

/** Returns the state row once and deletes it; null when unknown or already used. */
export async function consumeOauthState(state: string) {
  return maybeOne<{ user_id: string; redirect_uri: string; created_at: string }>(
    `DELETE FROM meta_oauth_states WHERE state = $1 RETURNING user_id, redirect_uri, created_at`,
    [state],
  );
}
