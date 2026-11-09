import { createFileRoute } from "@tanstack/react-router";

/** Path-specific form of the RFC 9728 metadata (resource https://<host>/mcp). */
export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { baseFor, oauthJson, protectedResourceMetadata } =
          await import("@/lib/oauth.server");
        return oauthJson(protectedResourceMetadata(baseFor(request)));
      },
      OPTIONS: async () => (await import("@/lib/oauth.server")).oauthPreflight(),
    },
  },
});
