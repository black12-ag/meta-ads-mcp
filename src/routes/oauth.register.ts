import { createFileRoute } from "@tanstack/react-router";

/** RFC 7591 dynamic client registration: Claude, ChatGPT and Cursor register themselves here. */
export const Route = createFileRoute("/oauth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { oauthErrorResponse, oauthJson, registerClient } =
          await import("@/lib/oauth.server");
        try {
          const body = await request.json().catch(() => null);
          return oauthJson(await registerClient(body), 201);
        } catch (err) {
          return oauthErrorResponse(err);
        }
      },
      OPTIONS: async () => (await import("@/lib/oauth.server")).oauthPreflight(),
    },
  },
});
