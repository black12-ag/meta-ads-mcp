/**
 * Transactional emails to a user, addressed from profiles.email. Server-only.
 * email_log holds one row per attempt (sent or failed) and doubles as the de-duplication
 * record, so callers can fire these without checking first. Users without an email are
 * skipped. Never throws: a failure is logged and returned as { ok: false }.
 */
import type { Finding } from "@/lib/alerts/rules";
import { maybeOne, q } from "@/lib/db/pool.server";
import { sendEmail, type SendResult } from "./resend.server";
import * as templates from "./templates";
import type { Email, EmailKind } from "./templates";

/**
 * What blocks a repeat: an earlier attempt of the same kind with the same ref (none = any ref),
 * optionally only inside a window such as "24 hours". null means never blocked.
 */
type Once = { ref?: string; within?: string } | null;

async function deliver(
  userId: string,
  kind: EmailKind,
  once: Once,
  build: () => Email,
): Promise<SendResult> {
  try {
    const profile = await maybeOne<{ email: string | null }>(
      "SELECT email FROM profiles WHERE id = $1",
      [userId],
    );
    if (!profile?.email) return { ok: false, reason: "no-email" };

    const ref = once?.ref ?? null;
    // shortcut: NOT EXISTS is not a lock, so two calls in the same instant could both send; add pg_advisory_xact_lock if that ever shows up.
    const claim = await maybeOne<{ id: string }>(
      `INSERT INTO email_log (user_id, kind, ref, ok)
       SELECT $1, $2, $3, false
       WHERE NOT $4 OR NOT EXISTS (
         SELECT 1 FROM email_log
         WHERE user_id = $1 AND kind = $2 AND ref IS NOT DISTINCT FROM $3
           AND ($5::interval IS NULL OR created_at > now() - $5::interval))
       RETURNING id`,
      [userId, kind, ref, once !== null, once?.within ?? null],
    );
    if (!claim) return { ok: false, reason: "duplicate" };

    const email = build();
    const result = await sendEmail({
      to: profile.email,
      kind,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: ref ? `${kind}/${userId}/${ref}` : undefined,
    });
    await q("UPDATE email_log SET ok = $2, provider_id = $3, error = $4 WHERE id = $1", [
      claim.id,
      result.ok,
      result.ok ? result.id : null,
      result.ok ? null : (result.error ?? result.reason),
    ]);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${kind} failed: ${message}`);
    return { ok: false, reason: "failed", error: message };
  }
}

/** Once per pending request. base is the public origin, e.g. https://ads.viral4all.com. */
export function notifyApprovalRequested(
  userId: string,
  r: {
    id: string;
    actionTitle: string;
    headline: string;
    requester: string;
    base: string;
    expiresInMinutes?: number;
  },
) {
  return deliver(userId, "approvalRequested", { ref: r.id }, () =>
    templates.approvalRequested({
      requester: r.requester,
      actionTitle: r.actionTitle,
      headline: r.headline,
      approveUrl: `${r.base}/approve/${r.id}`,
      expiresInMinutes: r.expiresInMinutes ?? 30,
    }),
  );
}

/** Once per request, after the owner approved it. */
export function notifyChangeApplied(
  userId: string,
  r: { id: string; headline: string; ok: boolean; error?: string | null; base: string },
) {
  return deliver(userId, "changeApplied", { ref: r.id }, () =>
    templates.changeApplied({
      headline: r.headline,
      ok: r.ok,
      error: r.error,
      requestUrl: `${r.base}/approve/${r.id}`,
    }),
  );
}

/** At most once ever per user. */
export function notifyWelcome(userId: string) {
  return deliver(userId, "welcome", {}, templates.welcome);
}

/** Once per grant when ref is given (e.g. the OAuth client_id); every time otherwise. */
export function notifyAiAppConnected(
  userId: string,
  a: { appName: string; canWrite: boolean; ref?: string },
) {
  return deliver(userId, "aiAppConnected", a.ref ? { ref: a.ref } : null, () =>
    templates.aiAppConnected(a),
  );
}

/** At most once per 24 hours per user. */
export function notifyMetaNeedsReconnect(userId: string, m: { reason: string }) {
  return deliver(userId, "metaNeedsReconnect", { within: "24 hours" }, () =>
    templates.metaNeedsReconnect(m),
  );
}

/** Once per ad account per day; day is the account's own calendar day (YYYY-MM-DD). */
export function notifyAccountAlerts(
  userId: string,
  a: {
    accountId: string;
    accountName: string;
    day: string;
    findings: Finding[];
    pauseRequested?: boolean;
  },
) {
  return deliver(userId, "accountAlerts", { ref: `${a.accountId}:${a.day}` }, () =>
    templates.accountAlerts(a),
  );
}
