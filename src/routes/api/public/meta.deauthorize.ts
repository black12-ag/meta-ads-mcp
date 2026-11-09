import { createFileRoute } from "@tanstack/react-router";
import { parseSignedRequest, purgeMetaUser } from "@/lib/meta/signed-request.server";

async function readSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { signed_request?: string }
      | null;
    return body?.signed_request ?? null;
  }
  const form = await request.formData().catch(() => null);
  const value = form?.get("signed_request");
  return typeof value === "string" ? value : null;
}

export const Route = createFileRoute("/api/public/meta/deauthorize")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const signedRequest = await readSignedRequest(request);
        if (!signedRequest) {
          return new Response("Missing signed_request", { status: 400 });
        }

        const payload = await parseSignedRequest(signedRequest);
        if (!payload?.user_id) {
          return new Response("Invalid signed_request", { status: 400 });
        }

        const removed = await purgeMetaUser(String(payload.user_id));
        return Response.json({ success: true, connections_removed: removed });
      },
    },
  },
});
