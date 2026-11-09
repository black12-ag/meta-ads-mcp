import { createFileRoute } from "@tanstack/react-router";

/** Domain proof for publishing to the official MCP Registry (HTTP method). Not found until set. */
export const Route = createFileRoute("/.well-known/mcp-registry-auth")({
  server: {
    handlers: {
      GET: async () => {
        const { registryProof } = await import("@/lib/mcp/local.server");
        const proof = registryProof();
        return proof
          ? new Response(`${proof}\n`, { headers: { "content-type": "text/plain; charset=utf-8" } })
          : new Response("Not found", { status: 404 });
      },
    },
  },
});
