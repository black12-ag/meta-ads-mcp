import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, preflight, withApiKey } from "@/lib/api-keys.server";

const schema = z.object({
  url: z.string().url(),
  filename: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/public/v1/media")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: ({ request }) =>
        withApiKey(request, "media:write", async (userId: string) => {
          const { url, filename } = schema.parse(await request.json());
          const { importMediaFromUrl } = await import("@/lib/meta/actions.server");
          const media = await importMediaFromUrl(userId, url, filename);
          return json({ ok: true, ...media }, 201);
        }),
    },
  },
});
