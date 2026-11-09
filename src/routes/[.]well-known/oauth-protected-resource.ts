import { createFileRoute } from "@tanstack/react-router";

/** RFC 9728 metadata for the MCP endpoint; /mcp's 401 points clients here. */
export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
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
