import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";

/** Home card: the latest account alert of each kind from the last 7 days, at most 10. */
export const listRecentAlerts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { recentAlerts } = await import("@/lib/alerts/check.server");
    return recentAlerts(context.userId);
  });
