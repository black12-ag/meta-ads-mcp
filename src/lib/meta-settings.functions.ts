import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

/** Saved Meta integration configuration for the signed-in user. */
export const fetchMetaSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getMetaSettings } = await import("@/lib/meta/settings.server");
    return getMetaSettings(context.userId);
  });

const saveSchema = z.object({
  publicBaseUrl: z.string().trim().max(300),
  redirectPath: z.string().trim().max(200),
  webhookPath: z.string().trim().max(200),
  deauthorizePath: z.string().trim().max(200),
  dataDeletionPath: z.string().trim().max(200),
  verifyToken: z.string().trim().max(500).optional(),
});

/** Persist the configuration. An empty verify token keeps the stored one. */
export const saveMetaSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { saveMetaSettings } = await import("@/lib/meta/settings.server");
    return saveMetaSettings(context.userId, data);
  });

/** Run the live configuration checks against the saved URLs. */
export const validateMetaSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { validateMetaSettings } = await import("@/lib/meta/settings.server");
    return validateMetaSettings(context.userId);
  });
