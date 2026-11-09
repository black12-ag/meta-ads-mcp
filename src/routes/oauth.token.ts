import { createFileRoute } from "@tanstack/react-router";

/** OAuth token endpoint: authorization_code (PKCE) and refresh_token grants. */
export const Route = createFileRoute("/oauth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { exchangeToken, oauthErrorResponse, oauthJson, readForm } =
          await import("@/lib/oauth.server");
        try {
          const form = await readForm(request);
          return oauthJson(await exchangeToken(form, request.headers.get("authorization")));
        } catch (err) {
          return oauthErrorResponse(err);
        }
      },
      OPTIONS: async () => (await import("@/lib/oauth.server")).oauthPreflight(),
    },
  },
});
