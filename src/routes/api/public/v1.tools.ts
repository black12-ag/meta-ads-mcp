import { createFileRoute } from "@tanstack/react-router";
import { preflight } from "@/lib/api-keys.server";

/** The tools an API key or OAuth app may run, with input schemas. */
export const Route = createFileRoute("/api/public/v1/tools")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: async ({ request }) => {
        const { listToolsRequest } = await import("@/lib/mcp/local.server");
        return listToolsRequest(request);
      },
    },
  },
});
