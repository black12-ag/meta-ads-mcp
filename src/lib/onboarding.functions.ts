import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";

/** Which "Getting started" steps the signed-in user has finished, read from real data. */
export const getOnboarding = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { one } = await import("@/lib/db/pool.server");
    return one<{ meta: boolean; account: boolean; ai: boolean; asked: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM meta_connections WHERE user_id = $1) AS meta,
         EXISTS (SELECT 1 FROM meta_connections WHERE user_id = $1
                 AND active_ad_account_id IS NOT NULL AND active_page_id IS NOT NULL) AS account,
         EXISTS (SELECT 1 FROM oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL)
           OR EXISTS (SELECT 1 FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL) AS ai,
         EXISTS (SELECT 1 FROM api_audit_log WHERE user_id = $1 AND source = 'mcp') AS asked`,
      [context.userId],
    );
  });
