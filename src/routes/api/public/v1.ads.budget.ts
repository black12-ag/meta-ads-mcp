import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, preflight, withApiKey } from "@/lib/api-keys.server";

const schema = z.object({
  objectId: z.string().min(1).describe("Ad set or campaign id"),
  kind: z.enum(["daily", "lifetime"]).default("daily"),
  budgetMinorUnits: z.number().int().min(100).max(100_000_000),
});

export const Route = createFileRoute("/api/public/v1/ads/budget")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: ({ request }) =>
        withApiKey(request, "ads:budget", async (userId: string) => {
          const input = schema.parse(await request.json());
          const { enforceDirect } = await import("@/lib/mcp/confirm.server");
          await enforceDirect(userId, [input.objectId], {
            budget: { kind: input.kind, to: input.budgetMinorUnits },
          });
          const { setObjectBudget } = await import("@/lib/meta/actions.server");
          const result = await setObjectBudget(
            userId,
            input.objectId,
            input.kind,
            input.budgetMinorUnits,
          );
          return json(result);
        }),
    },
  },
});
