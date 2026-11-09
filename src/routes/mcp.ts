import { createFileRoute } from "@tanstack/react-router";

/** MCP endpoint for Claude, Cursor and other AI clients. Auth: Bearer sk_meta_… API key. */
export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { handleMcpRequest } = await import("@/lib/mcp/handler.server");
        return handleMcpRequest(request);
      },
    },
  },
});
