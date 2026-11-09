import { createFileRoute } from "@tanstack/react-router";

/** Domain verification for OpenAI's plugin directory: the exact token, as plain text. */
export const Route = createFileRoute("/.well-known/openai-apps-challenge")({
  server: {
    handlers: {
      GET: async () => {
        const { openAiChallenge } = await import("@/lib/mcp/local.server");
        const token = openAiChallenge();
        return token
          ? new Response(token, { headers: { "content-type": "text/plain; charset=utf-8" } })
          : new Response("Not found", { status: 404 });
      },
    },
  },
});
