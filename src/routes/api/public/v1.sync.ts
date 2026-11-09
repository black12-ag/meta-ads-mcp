import { createFileRoute } from "@tanstack/react-router";
import { json, preflight, withApiKey } from "@/lib/api-keys.server";

export const Route = createFileRoute("/api/public/v1/sync")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: ({ request }) =>
        withApiKey(request, "ads:read", async (userId: string) => {
          const { listSyncRuns } = await import("@/lib/db/sync.server");
          const runs = await listSyncRuns(userId, 10);
          return json({
            runs: runs.map((r) => ({
              status: r.status,
              ads_synced: r.ads_synced,
              source: r.source,
              error_message: r.error_message,
              created_at: r.created_at,
            })),
          });
        }),
      POST: ({ request }) =>
        withApiKey(request, "sync:write", async (userId: string) => {
          const { syncUser } = await import("@/lib/meta/sync.server");
          const outcome = await syncUser(userId, "api");
          return json(outcome, outcome.status === "error" ? 502 : 200);
        }),
    },
  },
});
