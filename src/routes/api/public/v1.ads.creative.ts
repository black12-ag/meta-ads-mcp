import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, preflight, withApiKey } from "@/lib/api-keys.server";

const schema = z.object({
  adId: z.string().min(1),
  destination: z.enum(["website", "whatsapp", "facebook_page", "messenger"]).optional(),
  destinationValue: z.string().min(1).max(500).optional(),
  headline: z.string().min(1).max(255).optional(),
  primaryText: z.string().min(1).max(2000).optional(),
  description: z.string().max(500).optional(),
  callToAction: z.string().min(2).max(40).optional(),
  imageUrl: z.string().url().nullable().optional(),
  videoId: z.string().max(64).nullable().optional(),
  thumbnailHash: z.string().max(128).nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
});

export const Route = createFileRoute("/api/public/v1/ads/creative")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: ({ request }) =>
        withApiKey(request, "ads:creative", async (userId: string) => {
          const input = schema.parse(await request.json());
          const { enforceDirect } = await import("@/lib/mcp/confirm.server");
          await enforceDirect(userId, [input.adId]);
          const { updateAdCreative } = await import("@/lib/meta/actions.server");
          const result = await updateAdCreative(userId, input);
          return json({ ok: true, ...result });
        }),
    },
  },
});
