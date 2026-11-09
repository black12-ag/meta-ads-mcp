import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

/** Each connected ad account with its goals and AI limits (money in minor units). */
export const listAccountLimits = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listAdAccounts } = await import("@/lib/db/connections.server");
    const { listAccountSettings } = await import("@/lib/db/account-settings.server");
    const { getConnection } = await import("@/lib/meta/store.server");
    const [accounts, settings, conn] = await Promise.all([
      listAdAccounts(context.userId),
      listAccountSettings(context.userId),
      getConnection(context.userId),
    ]);
    return {
      activeAdAccountId: conn?.active_ad_account_id ?? null,
      accounts: accounts.map((a) => ({
        account_id: a.account_id,
        name: a.name,
        currency: a.currency,
        settings: settings.find((s) => s.account_id === a.account_id) ?? null,
      })),
    };
  });

const metaId = z.string().regex(/^\d{1,30}$/);
const money = z.number().positive().max(1e9).nullable();

/** Only the signed-in owner sets limits; no API key or AI tool can change them. */
export const saveAccountLimits = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        accountId: metaId,
        targetCpr: money,
        monthlyBudget: money,
        cycleStartDay: z.number().int().min(1).max(28),
        notes: z.string().trim().max(1000),
        maxDailyBudget: money,
        maxRaisePct: z.number().int().min(1).max(1000).nullable(),
        maxChangesPerDay: z.number().int().min(1).max(100).nullable(),
        protectedIds: z.array(metaId).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { findAdAccount } = await import("@/lib/db/connections.server");
    const { upsertAccountSettings } = await import("@/lib/db/account-settings.server");
    const { recordAudit } = await import("@/lib/audit.server");
    const { toMinor } = await import("@/lib/limits");
    const account = await findAdAccount(context.userId, data.accountId);
    if (!account) throw new Error("That ad account isn't connected.");
    // the smallest unit at least, so a tiny amount never turns into "no limit"
    const minor = (v: number | null) =>
      v == null ? null : Math.max(1, toMinor(v, account.currency));
    const saved = await upsertAccountSettings(context.userId, data.accountId, {
      target_cpr_cents: minor(data.targetCpr),
      monthly_budget_cents: minor(data.monthlyBudget),
      cycle_start_day: data.cycleStartDay,
      notes: data.notes || null,
      max_daily_budget_cents: minor(data.maxDailyBudget),
      max_raise_pct: data.maxRaisePct,
      max_changes_per_day: data.maxChangesPerDay,
      protected_ids: [...new Set(data.protectedIds)],
    });
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "limits.save",
      adAccountId: data.accountId,
      ok: true,
      detail: { ...saved, notes: undefined },
    });
    return saved;
  });
