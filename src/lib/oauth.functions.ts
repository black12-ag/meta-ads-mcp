import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

const request = z.object({
  params: z.record(z.string(), z.string()),
  origin: z.string().url(),
});

/** What the consent screen shows. Errors come back as data so the page can explain them. */
export const describeAuthorization = createServerFn({ method: "POST" })
  .validator((d: unknown) => request.parse(d))
  .handler(async ({ data }) => {
    const { checkAuthorizeRequest, OAuthError } = await import("@/lib/oauth.server");
    const { publicOrigin } = await import("@/lib/meta/graph.server");
    try {
      const r = await checkAuthorizeRequest(data.params, publicOrigin(data.origin));
      return {
        ok: true as const,
        clientName: r.clientName,
        redirectHost: r.redirectHost,
        scopes: r.scopes,
      };
    } catch (err) {
      if (err instanceof OAuthError) {
        return { ok: false as const, error: err.code, description: err.description };
      }
      throw err;
    }
  });

export const approveAuthorization = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => request.extend({ allowWrite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const oauth = await import("@/lib/oauth.server");
    const { publicOrigin } = await import("@/lib/meta/graph.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const url = await oauth.approveAuthorization(
      context.userId,
      data.params,
      data.allowWrite,
      publicOrigin(data.origin),
    );
    const req = await oauth.checkAuthorizeRequest(data.params, publicOrigin(data.origin));
    const { notifyAiAppConnected } = await import("@/lib/email/notify.server");
    void notifyAiAppConnected(context.userId, {
      appName: req.clientName ?? "An AI app",
      canWrite: data.allowWrite && req.scopes.includes("mcp:write"),
      ref: req.params.client_id,
    });
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "oauth.approve",
      ok: true,
      detail: { client_id: data.params.client_id, write: data.allowWrite },
    });
    return { redirectTo: url };
  });

export const denyAuthorization = createServerFn({ method: "POST" })
  .validator((d: unknown) => request.parse(d))
  .handler(async ({ data }) => {
    const { denyAuthorization: deny } = await import("@/lib/oauth.server");
    const { publicOrigin } = await import("@/lib/meta/graph.server");
    return { redirectTo: await deny(data.params, publicOrigin(data.origin)) };
  });

export const listConnectedApps = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listOAuthGrantsByUser } = await import("@/lib/db/oauth.server");
    return listOAuthGrantsByUser(context.userId);
  });

export const revokeConnectedApp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revokeOAuthGrant } = await import("@/lib/db/oauth.server");
    const { recordAudit } = await import("@/lib/audit.server");
    await revokeOAuthGrant(context.userId, data.id);
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "oauth.revoke",
      ok: true,
      detail: { grant_id: data.id },
    });
    return { ok: true as const };
  });
