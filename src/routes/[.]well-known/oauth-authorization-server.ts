import { createFileRoute } from "@tanstack/react-router";

/** RFC 8414 metadata: how MCP clients find our authorize, token and registration endpoints. */
export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizationServerMetadata, baseFor, oauthJson } =
          await import("@/lib/oauth.server");
        return oauthJson(authorizationServerMetadata(baseFor(request)));
      },
      OPTIONS: async () => (await import("@/lib/oauth.server")).oauthPreflight(),
    },
  },
});
