/** oauth_clients, oauth_codes, oauth_tokens and mcp_pending_actions. Server-only. */
import { maybeOne, one, q } from "./pool.server";

export interface OAuthClientRow {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  client_secret_hash: string | null;
  created_at: string;
}

export async function insertOAuthClient(row: {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  client_secret_hash: string | null;
}) {
  return one<OAuthClientRow>(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, client_secret_hash)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [row.client_id, row.client_name, row.redirect_uris, row.client_secret_hash],
  );
}

export async function findOAuthClient(clientId: string) {
  return maybeOne<OAuthClientRow>(`SELECT * FROM oauth_clients WHERE client_id = $1`, [clientId]);
}

// ---- authorization codes ----

export async function insertOAuthCode(row: {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scopes: string[];
  expires_at: string;
}) {
  await q(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.code_hash,
      row.client_id,
      row.user_id,
      row.redirect_uri,
      row.code_challenge,
      row.scopes,
      row.expires_at,
    ],
  );
}

/** Returns the code once and deletes it; null when unknown or already used. */
export async function consumeOAuthCode(codeHash: string) {
  return maybeOne<{
    client_id: string;
    user_id: string;
    redirect_uri: string;
    code_challenge: string;
    scopes: string[];
    expires_at: string;
  }>(
    `DELETE FROM oauth_codes WHERE code_hash = $1
     RETURNING client_id, user_id, redirect_uri, code_challenge, scopes, expires_at`,
    [codeHash],
  );
}

// ---- tokens (one row per grant) ----

export interface OAuthGrantRow {
  id: string;
  user_id: string;
  client_id: string;
  scopes: string[];
  access_expires_at: string;
  refresh_expires_at: string | null;
}

export async function insertOAuthGrant(row: {
  user_id: string;
  client_id: string;
  scopes: string[];
  access_hash: string;
  access_expires_at: string;
  refresh_hash: string;
  refresh_expires_at: string;
}) {
  return one<OAuthGrantRow>(
    `INSERT INTO oauth_tokens
       (user_id, client_id, scopes, access_hash, access_expires_at, refresh_hash, refresh_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, client_id, scopes, access_expires_at, refresh_expires_at`,
    [
      row.user_id,
      row.client_id,
      row.scopes,
      row.access_hash,
      row.access_expires_at,
      row.refresh_hash,
      row.refresh_expires_at,
    ],
  );
}

/** Swap in new token hashes when the presented refresh token is current. Single use by design. */
export async function rotateOAuthGrant(
  oldRefreshHash: string,
  clientId: string,
  next: {
    access_hash: string;
    access_expires_at: string;
    refresh_hash: string;
    refresh_expires_at: string;
  },
) {
  return maybeOne<OAuthGrantRow>(
    `UPDATE oauth_tokens SET access_hash = $3, access_expires_at = $4, refresh_hash = $5,
       refresh_expires_at = $6, last_used_at = now()
     WHERE refresh_hash = $1 AND client_id = $2 AND revoked_at IS NULL AND refresh_expires_at > now()
     RETURNING id, user_id, client_id, scopes, access_expires_at, refresh_expires_at`,
    [
      oldRefreshHash,
      clientId,
      next.access_hash,
      next.access_expires_at,
      next.refresh_hash,
      next.refresh_expires_at,
    ],
  );
}

/** The live grant for an access token, or null when unknown, expired or revoked. */
export async function findGrantByAccessHash(accessHash: string) {
  return maybeOne<{
    id: string;
    user_id: string;
    client_id: string;
    scopes: string[];
    client_name: string | null;
  }>(
    `WITH g AS (
       UPDATE oauth_tokens SET last_used_at = now()
       WHERE access_hash = $1 AND revoked_at IS NULL AND access_expires_at > now()
       RETURNING id, user_id, client_id, scopes)
     SELECT g.*, c.client_name FROM g JOIN oauth_clients c USING (client_id)`,
    [accessHash],
  );
}

export async function listOAuthGrantsByUser(userId: string) {
  return q<{
    id: string;
    client_id: string;
    client_name: string | null;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
  }>(
    `SELECT t.id, t.client_id, c.client_name, t.scopes, t.created_at, t.last_used_at
     FROM oauth_tokens t JOIN oauth_clients c USING (client_id)
     WHERE t.user_id = $1 AND t.revoked_at IS NULL AND t.refresh_expires_at > now()
     ORDER BY t.created_at DESC`,
    [userId],
  );
}

export async function revokeOAuthGrant(userId: string, id: string) {
  await q(`UPDATE oauth_tokens SET revoked_at = now() WHERE user_id = $1 AND id = $2`, [
    userId,
    id,
  ]);
}

// ---- pending MCP actions ----

export interface PendingActionRow {
  id: string;
  requested_via: string | null;
  created_at: string;
  account_id: string | null;
  decision_note: string | null;
  before_state: Record<string, unknown> | null;
  undone_at: string | null;
  action: string;
  scope: string;
  params: Record<string, unknown>;
  summary: Record<string, unknown>;
  expires_at: string;
  decision: "approved" | "rejected" | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

const PENDING_COLUMNS = `id, action, scope, params, summary, expires_at, decision, result, error,
  requested_via, created_at, account_id, decision_note, before_state, undone_at`;

export async function insertPendingAction(row: {
  token_hash: string;
  user_id: string;
  action: string;
  scope: string;
  params: unknown;
  summary: unknown;
  expires_at: string;
  requested_via?: string | null;
  account_id?: string | null;
}) {
  return one<{ id: string }>(
    `INSERT INTO mcp_pending_actions
       (token_hash, user_id, action, scope, params, summary, expires_at, requested_via, account_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      row.token_hash,
      row.user_id,
      row.action,
      row.scope,
      JSON.stringify(row.params),
      JSON.stringify(row.summary),
      row.expires_at,
      row.requested_via ?? null,
      row.account_id ?? null,
    ],
  );
}

/** The approvals inbox: everything still waiting, then the latest decisions. */
export async function listPendingActions(userId: string, limit = 30) {
  return q<PendingActionRow>(
    `SELECT ${PENDING_COLUMNS} FROM mcp_pending_actions WHERE user_id = $1
     ORDER BY (decision IS NULL AND expires_at > now()) DESC, created_at DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function countWaitingActions(userId: string) {
  const row = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM mcp_pending_actions
     WHERE user_id = $1 AND decision IS NULL AND expires_at > now()`,
    [userId],
  );
  return row.n;
}

export async function findPendingAction(id: string, userId: string) {
  return maybeOne<PendingActionRow>(
    `SELECT ${PENDING_COLUMNS} FROM mcp_pending_actions WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}

export async function findPendingActionByToken(tokenHash: string, userId: string) {
  return maybeOne<PendingActionRow>(
    `SELECT ${PENDING_COLUMNS} FROM mcp_pending_actions WHERE token_hash = $1 AND user_id = $2`,
    [tokenHash, userId],
  );
}

/** Record the user's decision once; null when unknown, expired, already decided, or not theirs. */
export async function decidePendingAction(
  id: string,
  userId: string,
  decision: "approved" | "rejected",
  note: string | null = null,
) {
  return maybeOne<PendingActionRow>(
    `UPDATE mcp_pending_actions SET decision = $3, decision_note = $4, consumed_at = now()
     WHERE id = $1 AND user_id = $2 AND decision IS NULL AND expires_at > now()
     RETURNING ${PENDING_COLUMNS}`,
    [id, userId, decision, note],
  );
}

export async function savePendingOutcome(
  id: string,
  result: unknown,
  error: string | null,
  before: unknown = null,
) {
  await q(
    `UPDATE mcp_pending_actions SET result = $2, error = $3, before_state = COALESCE($4, before_state)
     WHERE id = $1`,
    [
      id,
      result === null ? null : JSON.stringify(result),
      error,
      before === null ? null : JSON.stringify(before),
    ],
  );
}

/** Claims an applied change for undo exactly once; null when not undoable or already undone. */
export async function claimUndo(id: string, userId: string) {
  return maybeOne<PendingActionRow>(
    `UPDATE mcp_pending_actions SET undone_at = now()
     WHERE id = $1 AND user_id = $2 AND decision = 'approved' AND error IS NULL
       AND before_state IS NOT NULL AND undone_at IS NULL
     RETURNING ${PENDING_COLUMNS}`,
    [id, userId],
  );
}

/** Gives the undo back when reverting failed, so the owner can try again. */
export async function releaseUndo(id: string) {
  await q(`UPDATE mcp_pending_actions SET undone_at = NULL WHERE id = $1`, [id]);
}
