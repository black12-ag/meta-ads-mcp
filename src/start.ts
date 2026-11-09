import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachAuthToken } from "@/lib/auth/attach-token";

/**
 * h3 converts a thrown error into an opaque `{"unhandled":true,"message":"HTTPError"}` 500,
 * so log every failure here with its stack before deciding what to return.
 */
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Defining src/start.ts opts out of the default CSRF middleware, so re-add it explicitly.
 * Behind nginx the server sees its own http://127.0.0.1:8094 origin while the browser sends
 * https://ads.viral4all.com, so the public origin has to be named explicitly.
 */
const publicOrigin = (() => {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
})();

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  ...(publicOrigin ? { origin: publicOrigin } : {}),
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachAuthToken],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
