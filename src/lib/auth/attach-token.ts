/**
 * Client middleware for every server function call: attaches the signed-in user's Firebase ID
 * token as a bearer header. Registered globally in src/start.ts.
 */
import { createMiddleware } from "@tanstack/react-start";

export const attachAuthToken = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token: string | null = null;
  if (typeof window !== "undefined") {
    const { getIdToken } = await import("./firebase-client");
    token = await getIdToken();
  }
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
