import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, preflight, withApiKey } from "@/lib/api-keys.server";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  objective: z
    .enum(["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS"])
    .default("OUTCOME_TRAFFIC"),
  budgetKind: z.enum(["daily", "lifetime"]).default("daily"),
  budgetMinorUnits: z.number().int().min(100).max(100_000_000),
  countries: z.array(z.string().length(2)).min(1).max(20).default(["US"]),
  ageMin: z.number().int().min(13).max(65).optional(),
  ageMax: z.number().int().min(13).max(65).optional(),
  genders: z.enum(["all", "male", "female"]).optional(),
  destination: z.enum(["website", "whatsapp", "facebook_page", "messenger"]).default("website"),
  destinationValue: z.string().min(1).max(500),
  callToAction: z.string().min(2).max(40).optional(),
  headline: z.string().min(1).max(255),
  primaryText: z.string().min(1).max(2000),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().nullable().optional(),
  videoId: z.string().max(64).nullable().optional(),
  thumbnailHash: z.string().max(128).nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
});

export const Route = createFileRoute("/api/public/v1/ads")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      GET: ({ request }) =>
        withApiKey(request, "ads:read", async (userId: string) => {
          const url = new URL(request.url);
          const { listAds } = await import("@/lib/meta/actions.server");
          const result = await listAds(userId, {
            datePreset: url.searchParams.get("date_preset") ?? "last_30d",
          });
          return json({
            account_id: result.accountId,
            currency: result.currency,
            last_synced_at: result.lastSyncedAt,
            count: result.ads.length,
            ads: result.ads,
          });
        }),
      POST: ({ request }) =>
        withApiKey(request, "ads:create", async (userId: string) => {
          const input = createSchema.parse(await request.json());
          const { createCampaign } = await import("@/lib/meta/actions.server");
          const { enforceNewCampaign } = await import("@/lib/mcp/confirm.server");
          await enforceNewCampaign(userId, input);
          const created = await createCampaign(userId, input);
          return json({ ok: true, ...created }, 201);
        }),
    },
  },
});
