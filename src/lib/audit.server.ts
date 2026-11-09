/**
 * Audit trail for every action performed with an API key (and for
 * equivalent actions triggered from the dashboard or MCP tools).
 * Writes are best-effort: auditing must never break the actual request.
 */
import { insertAudit, listAudit as listAuditRows } from "@/lib/db/keys.server";

export interface AuditEntryInput {
  userId: string;
  apiKeyId?: string | null;
  keyPrefix?: string | null;
  source?: "api" | "dashboard" | "mcp" | "system";
  action: string;
  method?: string | null;
  path?: string | null;
  adAccountId?: string | null;
  ok: boolean;
  statusCode?: number | null;
  durationMs?: number | null;
  detail?: Record<string, unknown>;
  error?: string | null;
}

/** Human label for a request path, so the log reads like plain English. */
export function actionFromPath(method: string, path: string) {
  const p = path.replace(/\/+$/, "");
  if (p.endsWith("/v1/ads") && method === "GET") return "ads.list";
  if (p.endsWith("/v1/ads") && method === "POST") return "ads.create";
  if (p.endsWith("/v1/ads/status")) return "ads.status";
  if (p.endsWith("/v1/ads/creative")) return "ads.creative";
  if (p.endsWith("/v1/ads/budget")) return "ads.budget";
  if (p.endsWith("/v1/media")) return "media.upload";
  if (p.endsWith("/v1/sync")) return "sync.run";
  return `${method.toLowerCase()}:${p}`;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "ads.list": "Listed ads",
  "ads.create": "Created ad",
  "ads.status": "Paused / resumed ads",
  "ads.creative": "Updated creative",
  "ads.budget": "Changed budget",
  "media.upload": "Uploaded media",
  "sync.run": "Triggered sync",
  "keys.create": "Created API key",
  "keys.revoke": "Revoked API key",
  "keys.scopes": "Changed key permissions",
  "account.switch": "Switched ad account",
  "connection.connect": "Connected Meta account",
  "connection.disconnect": "Disconnected Meta account",
  "connection.sync": "Synced pages & ad accounts",
  "mcp.approve": "Approved an AI change",
  "mcp.reject": "Rejected an AI change",
  "mcp.undo": "Undid an AI change",
  "limits.save": "Saved goals & limits",
  "webhooks.create": "Added a webhook",
  "webhooks.delete": "Deleted a webhook",
};

/** Actions that describe changes to the Meta connection itself. */
export const CONNECTION_ACTIONS = [
  "connection.connect",
  "connection.disconnect",
  "connection.sync",
  "account.switch",
];

export async function recordAudit(entry: AuditEntryInput) {
  try {
    await insertAudit({
      user_id: entry.userId,
      api_key_id: entry.apiKeyId ?? null,
      key_prefix: entry.keyPrefix ?? null,
      source: entry.source ?? "api",
      action: entry.action,
      method: entry.method ?? null,
      path: entry.path ?? null,
      ad_account_id: entry.adAccountId ?? null,
      ok: entry.ok,
      status_code: entry.statusCode ?? null,
      duration_ms: entry.durationMs ?? null,
      detail: entry.detail ?? {},
      error: entry.error ?? null,
    });
  } catch (err) {
    console.error("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}

export async function listAudit(
  userId: string,
  opts: { limit?: number; action?: string; actions?: string[]; onlyFailures?: boolean } = {},
) {
  return listAuditRows(userId, opts);
}
