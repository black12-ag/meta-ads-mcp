import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { isRequestableSource } from "@/lib/platform-marks";

const sourceInput = z.object({
  source: z.string().refine(isRequestableSource, "That source can't be requested"),
});

/** Planned sources the signed-in user asked to hear about. */
export const listMySourceRequests = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { q } = await import("@/lib/db/pool.server");
    const rows = await q<{ source: string }>(
      "SELECT source FROM source_requests WHERE user_id = $1",
      [context.userId],
    );
    return rows.map((r) => r.source);
  });

/** "Notify me": one row per user and source, so asking twice changes nothing. */
export const requestSource = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => sourceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { q } = await import("@/lib/db/pool.server");
    await q(
      "INSERT INTO source_requests (user_id, source) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [context.userId, data.source],
    );
    return { ok: true as const };
  });
