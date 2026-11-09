import { createFileRoute } from "@tanstack/react-router";

/** The app's own Meta OAuth callback. Shares its logic with /auth/meta/callback. */
export const Route = createFileRoute("/api/public/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleMetaCallback } = await import("@/lib/meta/callback.server");
        return handleMetaCallback(request);
      },
    },
  },
});
