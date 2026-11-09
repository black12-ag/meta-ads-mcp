/**
 * Server-function middleware: verifies the Firebase ID token sent by the browser and exposes
 * { userId, email } on the context. Creates the user's profile row on first sight.
 * This file is imported by *.functions.ts modules that ship to the client, so every server
 * dependency is loaded lazily inside the handler.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const seenProfiles = new Set<string>();

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    const { verifyBearer } = await import("./verify.server");
    const request = getRequest();
    const { uid, email, emailVerified } = await verifyBearer(
      request?.headers.get("authorization") ?? null,
    );
    // Keyed on verification too, so the address is saved once the person verifies it.
    const seen = `${uid}:${emailVerified}`;
    if (!seenProfiles.has(seen)) {
      const { ensureProfile } = await import("@/lib/db/profiles.server");
      // Only a verified address becomes the one we send alerts to: anyone can sign up with
      // someone else's email.
      const created = await ensureProfile(uid, emailVerified ? email : null, null);
      seenProfiles.add(seen);
      // Welcome only new accounts with a verified address, so we never mail someone else's inbox.
      if (created && emailVerified) {
        const { notifyWelcome } = await import("@/lib/email/notify.server");
        void notifyWelcome(uid);
      }
    }
    return next({ context: { userId: uid, email } });
  } catch (error) {
    // h3 turns a thrown error into an opaque 500, so record the reason here. Never log the token.
    console.error("[auth]", error instanceof Error ? error.message : error);
    throw error;
  }
});
