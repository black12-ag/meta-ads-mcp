import { createFileRoute } from "@tanstack/react-router";

/** Serves an uploaded creative when the URL carries a valid, unexpired signature. */
export const Route = createFileRoute("/api/creatives/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const storagePath = (params as { _splat?: string })._splat ?? "";
        const url = new URL(request.url);
        const { contentTypeFor, readCreative, verifyCreativeUrl } = await import(
          "@/lib/storage/creatives.server"
        );
        if (!verifyCreativeUrl(storagePath, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
          return new Response("Forbidden", { status: 403 });
        }
        const file = await readCreative(storagePath);
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(new Uint8Array(file), {
          status: 200,
          headers: {
            "content-type": contentTypeFor(storagePath),
            "content-length": String(file.byteLength),
            "cache-control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
