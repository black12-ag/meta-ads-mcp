import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

export const listKeys = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listApiKeys } = await import("@/lib/api-keys.server");
    return listApiKeys(context.userId);
  });

export const createKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(60),
        scopes: z.array(z.string().min(3).max(32)).max(20).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createApiKey } = await import("@/lib/api-keys.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const created = await createApiKey(context.userId, data.name, data.scopes);
    await recordAudit({
      userId: context.userId,
      apiKeyId: created.id,
      keyPrefix: created.key_prefix,
      source: "dashboard",
      action: "keys.create",
      ok: true,
      detail: { name: created.name, scopes: created.scopes },
    });
    return created;
  });

export const setKeyScopes = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        scopes: z.array(z.string().min(3).max(32)).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateApiKeyScopes } = await import("@/lib/api-keys.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const result = await updateApiKeyScopes(context.userId, data.id, data.scopes);
    await recordAudit({
      userId: context.userId,
      apiKeyId: data.id,
      source: "dashboard",
      action: "keys.scopes",
      ok: true,
      detail: { scopes: data.scopes },
    });
    return result;
  });

export const revokeKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revokeApiKey } = await import("@/lib/api-keys.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const result = await revokeApiKey(context.userId, data.id);
    await recordAudit({
      userId: context.userId,
      apiKeyId: data.id,
      source: "dashboard",
      action: "keys.revoke",
      ok: true,
      detail: {},
    });
    return result;
  });
