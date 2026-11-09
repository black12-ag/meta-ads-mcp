import { createFileRoute } from "@tanstack/react-router";

/** How an AI agent connects and what it may do (llmstxt.org). Public. */
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { llmsText } = await import("@/lib/mcp/local.server");
        const { publicOrigin } = await import("@/lib/meta/graph.server");
        // Cached publicly, so the links never come from the request's Host header.
        const base = publicOrigin("https://ads.viral4all.com");
        return new Response(await llmsText(base), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
