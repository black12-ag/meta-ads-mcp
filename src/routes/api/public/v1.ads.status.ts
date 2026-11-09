import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, preflight, withApiKey } from "@/lib/api-keys.server";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["pause", "resume"]),
});

export const Route = createFileRoute("/api/public/v1/ads/status")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: ({ request }) =>
        withApiKey(request, "ads:status", async (userId: string) => {
          const { ids, action } = schema.parse(await request.json());
          const { enforceDirect } = await import("@/lib/mcp/confirm.server");
          await enforceDirect(userId, ids, action === "pause" ? { pause: true } : { resume: true });
          const { setStatusBulk } = await import("@/lib/meta/actions.server");
          const result = await setStatusBulk(
            userId,
            ids,
            action === "resume" ? "ACTIVE" : "PAUSED",
          );
          return json({ ok: result.failed === 0, ...result });
        }),
    },
  },
});
