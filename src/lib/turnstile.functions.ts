import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/** The public Turnstile site key, or null when the check is switched off (local dev). */
export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(
  () => process.env.TURNSTILE_SITE_KEY?.trim() || null,
);

/** "Am I human?" for the sign-in form. With no secret configured there is nothing to check. */
export const verifyHuman = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: z.string().max(2048) }).parse(d))
  .handler(async ({ data }) => {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret) return { ok: true };
    const { verifyTurnstile } = await import("@/lib/auth/turnstile.server");
    const ip = getRequest().headers.get("cf-connecting-ip");
    return { ok: await verifyTurnstile(data.token, secret, ip) };
  });
