import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { approvalStatus } from "@/lib/approval-summary";

const byId = z.object({ id: z.string().uuid() });

/** A change an AI assistant asked for, as the signed-in owner sees it on /approve/<id>. */
export const getApproval = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => byId.parse(d))
  .handler(async ({ data, context }) => {
    const { findPendingAction } = await import("@/lib/db/oauth.server");
    const row = await findPendingAction(data.id, context.userId);
    if (!row) return null;
    return {
      action: row.action,
      summaryJson: JSON.stringify(row.summary),
      expired: !row.decision && Date.parse(row.expires_at) < Date.now(),
      decision: row.decision,
      resultJson: row.result ? JSON.stringify(row.result, null, 2) : null,
      error: row.error,
      requestedVia: row.requested_via,
      note: row.decision_note,
      undoneAt: row.undone_at,
      canUndo: row.decision === "approved" && !row.error && !!row.before_state && !row.undone_at,
    };
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    byId.extend({ approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { decide } = await import("@/lib/mcp/confirm.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const out = await decide(context.userId, data.id, data.approve, data.note || null);
    const error = "error" in out ? (out.error ?? null) : null;
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: data.approve ? "mcp.approve" : "mcp.reject",
      ok: !error,
      detail: { pending_id: data.id },
      error,
    });
    return { decision: out.decision, error };
  });

/** Put an applied change back as it was. Only the signed-in owner, only once. */
export const undoApproval = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => byId.parse(d))
  .handler(async ({ data, context }) => {
    const { undo } = await import("@/lib/mcp/confirm.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const error = await undo(context.userId, data.id).then(
      () => null,
      (err) => (err instanceof Error ? err.message : "Undo failed."),
    );
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "mcp.undo",
      ok: !error,
      detail: { pending_id: data.id },
      error,
    });
    return { error };
  });

/** The approvals inbox: waiting requests first, then the latest decisions. */
export const listApprovals = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listPendingActions } = await import("@/lib/db/oauth.server");
    const rows = await listPendingActions(context.userId);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      status: approvalStatus(r),
      summaryJson: JSON.stringify(r.summary),
      requestedVia: r.requested_via,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  });

/** Badge count for the menu. POST so a browser never serves a cached number. */
export const countWaitingApprovals = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { countWaitingActions } = await import("@/lib/db/oauth.server");
    return countWaitingActions(context.userId);
  });
