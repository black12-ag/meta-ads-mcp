import { createFileRoute } from "@tanstack/react-router";

/** OpenAPI 3.1 for the tools endpoint, for GPT Actions, Zapier, Make and n8n. Public. */
export const Route = createFileRoute("/api/public/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () => {
        const { openApiDocument } = await import("@/lib/mcp/local.server");
        const { publicOrigin } = await import("@/lib/meta/graph.server");
        // Cached publicly, so the links never come from the request's Host header.
        const base = publicOrigin("https://ads.viral4all.com");
        return Response.json(await openApiDocument(base), {
          headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
        });
      },
    },
  },
});
