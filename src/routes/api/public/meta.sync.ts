import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled insights sync. Call with:
 *   POST /api/public/meta/sync   header: x-cron-secret: <META_SYNC_CRON_SECRET>
 */
export const Route = createFileRoute("/api/public/meta/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["META_SYNC_CRON_SECRET"];
        if (!secret) {
          return Response.json({ error: "Sync secret not configured" }, { status: 500 });
        }
        const provided = request.headers.get("x-cron-secret") ?? "";
        const { timingSafeEqual } = await import("node:crypto");
        const same =
          provided.length === secret.length &&
          timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
        if (!same) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { syncAllConnections } = await import("@/lib/meta/sync.server");
        const { drainRetryQueue } = await import("@/lib/meta/retry.server");
        try {
          // Due retries first so transient failures recover before the sweep.
          const retries = await drainRetryQueue();
          const summary = await syncAllConnections("cron");
          const managed = {};
          return Response.json({ ok: true, retries, ...managed, ...summary });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Sync failed";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
