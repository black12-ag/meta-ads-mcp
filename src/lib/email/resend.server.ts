/**
 * Sends one email through Resend's REST API with plain fetch (no SDK). Server-only.
 * Without RESEND_API_KEY sending is a logged no-op, so local dev and tests never mail anyone.
 * Never throws: a failure is logged in one line and returned as { ok: false }.
 */

export type SendResult = { ok: true; id: string } | { ok: false; reason: string; error?: string };

export async function sendEmail(m: {
  to: string;
  kind: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  tags?: { name: string; value: string }[];
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.info(`[email] ${m.kind} not sent: RESEND_API_KEY is not set`);
    return { ok: false, reason: "disabled" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || "Viral4All Ads <alerts@viral4all.com>",
        to: [m.to],
        reply_to: process.env.EMAIL_REPLY_TO?.trim() || "support@viral4all.com",
        subject: m.subject,
        html: m.html,
        text: m.text,
        tags: [{ name: "kind", value: m.kind }, ...(m.tags ?? [])],
        // A unique ref stops Gmail from threading separate alerts that share a subject.
        headers: { "X-Entity-Ref-ID": m.idempotencyKey ?? crypto.randomUUID() },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      throw new Error(`Resend ${res.status}: ${data.message ?? "no message"}`);
    }
    return { ok: true, id: data.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${m.kind} failed: ${error}`);
    return { ok: false, reason: "failed", error };
  }
}
