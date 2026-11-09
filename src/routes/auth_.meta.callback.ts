import { createFileRoute } from "@tanstack/react-router";

/**
 * Meta OAuth callback on the path already registered in the Meta app's allow-list
 * (https://meta-ads-api.example.com/auth/meta/callback). Same handler as
 * /api/public/meta/callback; which one Meta uses depends on META_REDIRECT_URI.
 */
export const Route = createFileRoute("/auth_/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleMetaCallback } = await import("@/lib/meta/callback.server");
        return handleMetaCallback(request);
      },
    },
  },
});
