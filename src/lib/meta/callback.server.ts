/**
 * Handles Meta's OAuth redirect. Two routes share this: the app's own
 * `/api/public/meta/callback`, and `/auth/meta/callback`, which is the path already registered
 * in the Meta app's allow-list. Meta matches the redirect URI exactly, so the one we send in the
 * authorize URL (META_REDIRECT_URI) must be the one Meta has on file.
 */

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function page(title: string, body: string, ok: boolean) {
  const t = escapeHtml(title);
  const b = escapeHtml(body);
  const home = appOrigin();
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b0c0b;color:#e9efe9;font-family:ui-sans-serif,system-ui,sans-serif">
<div style="max-width:32rem;padding:2rem;text-align:center">
<h1 style="font-size:1.25rem;margin:0 0 .75rem;color:${ok ? "#a3e635" : "#f87171"}">${t}</h1>
<p style="opacity:.75;line-height:1.6;margin:0 0 1.5rem">${b}</p>
<a href="${home}/connections" style="display:inline-block;padding:.65rem 1.1rem;border-radius:.6rem;background:#a3e635;color:#0b0c0b;text-decoration:none;font-weight:600">Back to Connections</a>
</div></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Where the person is browsing. The callback may arrive on a different hostname. */
function appOrigin() {
  return (process.env["PUBLIC_BASE_URL"] ?? "").trim().replace(/\/$/, "");
}

/** Holds the OAuth state in the browser that started the flow; the callback must present it. */
export const META_STATE_COOKIE = "v4a_meta_state";

const cookieValue = (request: Request, name: string) =>
  new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("cookie") ?? "")?.[1] ?? null;

export async function handleMetaCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (denied) return page("Meta connection cancelled", denied, false);
  if (!code || !state) {
    return page(
      "Missing authorization code",
      "Meta did not return a valid response. Try connecting again.",
      false,
    );
  }

  // Without this, anyone could send a victim their own Facebook link and get the victim's ad
  // accounts linked to the sender's workspace.
  if (cookieValue(request, META_STATE_COOKIE) !== state) {
    return page(
      "Start again from this browser",
      "This connection was started somewhere else. Open Viral4All Ads here and connect Meta again.",
      false,
    );
  }

  try {
    const { consumeOauthState } = await import("@/lib/db/connections.server");
    const { exchangeCodeForToken } = await import("./graph.server");
    const { upsertConnection } = await import("./store.server");

    const stateRow = await consumeOauthState(state);
    if (!stateRow) {
      return page(
        "Expired request",
        "This connection link is no longer valid. Start the connection again.",
        false,
      );
    }

    const ageMinutes = (Date.now() - new Date(stateRow.created_at).getTime()) / 60000;
    if (ageMinutes > 15) {
      return page("Expired request", "The connection request timed out. Please try again.", false);
    }

    const { token, expiresIn } = await exchangeCodeForToken(code, stateRow.redirect_uri);
    await upsertConnection(stateRow.user_id, token, expiresIn);

    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      userId: stateRow.user_id,
      source: "dashboard",
      action: "connection.connect",
      ok: true,
      detail: { expiresIn },
    });

    // Absolute, so a callback that lands on the API hostname still returns the person to the app.
    return new Response(null, {
      status: 302,
      headers: {
        location: `${appOrigin()}/connections?meta=connected`,
        "set-cookie": `${META_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[meta/callback]", message);
    return page("Could not finish connecting", message, false);
  }
}
