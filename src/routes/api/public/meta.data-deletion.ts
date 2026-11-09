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

function baseUrl(request: Request) {
  const configured = process.env["PUBLIC_BASE_URL"]?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export const Route = createFileRoute("/api/public/meta/data-deletion")({
  server: {
    handlers: {
      // Meta opens this in a browser so the user can check deletion status.
      GET: async ({ request }) => {
        const code = new URL(request.url).searchParams.get("code") ?? "";
        return new Response(
          `<!doctype html><html><head><meta charset="utf-8"><title>Data deletion status</title></head>` +
            `<body style="font-family:system-ui;background:#0d0f0e;color:#e7ece9;padding:48px">` +
            `<h1>Data deletion</h1>` +
            `<p>Request <strong>${code.replace(/[^a-zA-Z0-9_-]/g, "")}</strong> has been processed. ` +
            `All stored Meta credentials, ad accounts, pages and mirrored data for this user have been deleted.</p>` +
            `</body></html>`,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
      POST: async ({ request }) => {
        const signedRequest = await readSignedRequest(request);
        if (!signedRequest) {
          return new Response("Missing signed_request", { status: 400 });
        }

        const payload = await parseSignedRequest(signedRequest);
        if (!payload?.user_id) {
          return new Response("Invalid signed_request", { status: 400 });
        }

        const metaUserId = String(payload.user_id);
        await purgeMetaUser(metaUserId);

        const confirmationCode = `del_${metaUserId}_${Date.now().toString(36)}`;
        return Response.json({
          url: `${baseUrl(request)}/api/public/meta/data-deletion?code=${confirmationCode}`,
          confirmation_code: confirmationCode,
        });
      },
    },
  },
});
