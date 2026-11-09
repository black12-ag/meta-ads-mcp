import { fetchAdAccounts, fetchPages, fetchProfile, toCents } from "./graph.server";
import {
  findAdAccount,
  firstAdAccountForConnection,
  firstPageForConnection,
  getPrimaryConnection,
  listConnections as listConnectionRows,
  setPrimaryConnection,
  updateConnection,
  upsertAdAccounts,
  upsertConnection as upsertConnectionRow,
  upsertPages,
  type ConnectionRow,
} from "@/lib/db/connections.server";

/** The connection currently in focus (a user may link several Meta logins). */
export async function getConnection(userId: string): Promise<ConnectionRow | null> {
  return getPrimaryConnection(userId);
}

/** Every Meta login this user has connected. */
export async function listConnections(userId: string) {
  return listConnectionRows(userId);
}

/**
 * Make `accountId` the account every surface acts on, switching the primary
 * Meta login too when that account belongs to a different connection.
 */
export async function activateAdAccount(userId: string, accountId: string) {
  const account = await findAdAccount(userId, accountId);
  if (!account) throw new Error("That ad account is not connected to your workspace.");
  await setPrimaryConnection(userId, account.connection_id);
  await updateConnection(account.connection_id, { active_ad_account_id: account.account_id });
  return { accountId: account.account_id, name: account.name };
}

export async function requireConnection(userId: string): Promise<ConnectionRow> {
  const conn = await getConnection(userId);
  if (!conn) throw new Error("No Meta account connected. Connect Meta Ads first.");
  return conn;
}

/** Pull accounts + pages from Meta and mirror them into the database. */
export async function syncAssets(userId: string, connectionId: string, token: string) {
  const [accounts, pages] = await Promise.all([fetchAdAccounts(token), fetchPages(token)]);

  await upsertAdAccounts(
    accounts.map((a: any) => ({
      user_id: userId,
      connection_id: connectionId,
      account_id: String(a.account_id ?? a.id).replace(/^act_/, ""),
      name: a.name ?? `Account ${a.account_id}`,
      currency: a.currency ?? "USD",
      timezone_name: a.timezone_name ?? null,
      account_status: a.account_status ?? null,
      spend_cap_cents: a.spend_cap ? toCents(a.spend_cap) : null,
      amount_spent_cents: a.amount_spent ? toCents(a.amount_spent) : null,
      business_name: a.business?.name ?? null,
    })),
  );

  await upsertPages(
    pages.map((p: any) => ({
      user_id: userId,
      connection_id: connectionId,
      page_id: String(p.id),
      name: p.name ?? `Page ${p.id}`,
      category: p.category ?? null,
      picture_url: p.picture?.data?.url ?? null,
      tasks: p.tasks ?? [],
      instagram_business_id: p.instagram_business_account?.id ?? null,
    })),
  );

  return { accounts: accounts.length, pages: pages.length };
}

export async function upsertConnection(userId: string, token: string, expiresIn: number | null) {
  const profile = await fetchProfile(token);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  const data = await upsertConnectionRow({
    user_id: userId,
    meta_user_id: profile.id,
    meta_name: profile.name ?? null,
    meta_picture_url: profile.picture?.data?.url ?? null,
    access_token: token,
    token_expires_at: expiresAt,
  });

  // A freshly connected login becomes the one in focus.
  await setPrimaryConnection(userId, data.id);

  await syncAssets(userId, data.id, token);

  // Default the active account/page when nothing is chosen yet.
  if (!data.active_ad_account_id || !data.active_page_id) {
    const [acc, pg] = await Promise.all([
      firstAdAccountForConnection(userId, data.id),
      firstPageForConnection(userId, data.id),
    ]);
    await updateConnection(data.id, {
      active_ad_account_id: data.active_ad_account_id ?? acc?.account_id ?? null,
      active_page_id: data.active_page_id ?? pg?.page_id ?? null,
    });
  }

  return data;
}
