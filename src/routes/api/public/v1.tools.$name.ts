import { createFileRoute } from "@tanstack/react-router";
import { preflight } from "@/lib/api-keys.server";

/** Run one MCP tool over plain HTTP: POST a JSON object of its inputs. */
export const Route = createFileRoute("/api/public/v1/tools/$name")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: async ({ request, params }) => {
        const { runToolRequest } = await import("@/lib/mcp/local.server");
        return runToolRequest(request, params.name);
      },
    },
  },
});
