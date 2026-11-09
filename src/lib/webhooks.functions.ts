import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";

const byId = z.object({ id: z.string().uuid() });
const eventValues = WEBHOOK_EVENTS.map((e) => e.value) as [WebhookEvent, ...WebhookEvent[]];
const events = z.array(z.enum(eventValues)).min(1).max(eventValues.length);

// Only the host goes in the audit log: Slack and Discord URLs carry a token in the path.
const hostOf = (url: string) => new URL(url).host;

/** The signed-in owner's webhooks, without their signing secrets. */
export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listEndpoints } = await import("@/lib/webhooks/store.server");
    return listEndpoints(context.userId);
  });

/** Adds a webhook. The signing secret comes back here once and is never shown again. */
export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ url: z.string().trim().min(1).max(2000), events }).parse(d))
  .handler(async ({ data, context }) => {
    const { createEndpoint } = await import("@/lib/webhooks/store.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const out = await createEndpoint(context.userId, data.url, data.events);
    if (out.error === null) {
      await recordAudit({
        userId: context.userId,
        source: "dashboard",
        action: "webhooks.create",
        ok: true,
        detail: {
          id: out.endpoint.id,
          host: hostOf(out.endpoint.url),
          events: out.endpoint.events,
        },
      });
    }
    return out;
  });

export const updateWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    byId.extend({ events: events.optional(), active: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateEndpoint } = await import("@/lib/webhooks/store.server");
    return updateEndpoint(context.userId, data.id, data);
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => byId.parse(d))
  .handler(async ({ data, context }) => {
    const { deleteEndpoint } = await import("@/lib/webhooks/store.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const deleted = await deleteEndpoint(context.userId, data.id);
    if (deleted) {
      await recordAudit({
        userId: context.userId,
        source: "dashboard",
        action: "webhooks.delete",
        ok: true,
        detail: { id: data.id, host: hostOf(deleted.url) },
      });
    }
    return { ok: Boolean(deleted) };
  });

/** Sends a test message now and returns how it went. */
export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => byId.parse(d))
  .handler(async ({ data, context }) => {
    const { sendTest } = await import("@/lib/webhooks/store.server");
    const result = await sendTest(context.userId, data.id);
    return result ?? { ok: false, status: null, error: "This webhook no longer exists." };
  });
