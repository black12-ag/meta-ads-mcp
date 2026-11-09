import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

/** Every recorded API-key / dashboard action, newest first. */
export const listAuditEntries = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(100),
        action: z.string().min(2).max(60).optional(),
        onlyFailures: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listAudit } = await import("@/lib/audit.server");
    return listAudit(context.userId, {
      limit: data.limit,
      action: data.action,
      onlyFailures: data.onlyFailures,
    });
  });

/** Only the entries that describe Meta connection changes. */
export const listConnectionAudit = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listAudit, CONNECTION_ACTIONS } = await import("@/lib/audit.server");
    return listAudit(context.userId, { limit: data.limit, actions: CONNECTION_ACTIONS });
  });
