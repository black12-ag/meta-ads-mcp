import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

export const getMetaAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { authorizeUrl } = await import("@/lib/meta/graph.server");
    const { insertOauthState } = await import("@/lib/db/connections.server");
    const { META_STATE_COOKIE } = await import("@/lib/meta/callback.server");
    const { setCookie } = await import("@tanstack/react-start/server");
    const state = crypto.randomUUID();
    await insertOauthState(state, context.userId, data.origin);
    // Lax: the cookie must ride along on Meta's top-level redirect back to the callback.
    setCookie(META_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    return { url: authorizeUrl(data.origin, state) };
  });

export const getMetaOverview = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getConnection, listConnections } = await import("@/lib/meta/store.server");
    const { listAdAccounts, listPages } = await import("@/lib/db/connections.server");
    const conn = await getConnection(context.userId);
    if (!conn) return { connected: false as const };
    const [accounts, pages, connections] = await Promise.all([
      listAdAccounts(context.userId),
      listPages(context.userId),
      listConnections(context.userId),
    ]);
    return {
      connected: true as const,
      profile: {
        name: conn.meta_name,
        picture: conn.meta_picture_url,
        metaUserId: conn.meta_user_id,
        expiresAt: conn.token_expires_at,
      },
      connectionId: conn.id,
      connections,
      activeAdAccountId: conn.active_ad_account_id,
      activePageId: conn.active_page_id,
      accounts,
      pages,
    };
  });

/** Compact account switcher payload used across the dashboard. */
export const listMetaAccounts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getConnection } = await import("@/lib/meta/store.server");
    const { listAdAccounts } = await import("@/lib/db/connections.server");
    const conn = await getConnection(context.userId);
    if (!conn) return { connected: false as const, accounts: [], activeAdAccountId: null };
    const accounts = await listAdAccounts(context.userId);
    return {
      connected: true as const,
      accounts: accounts.map((a) => ({
        account_id: a.account_id,
        name: a.name,
        currency: a.currency,
        business_name: a.business_name,
        account_status: a.account_status,
        connection_id: a.connection_id,
      })),
      activeAdAccountId: conn.active_ad_account_id,
    };
  });

export const setMetaActive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({ adAccountId: z.string().min(1).optional(), pageId: z.string().min(1).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection, activateAdAccount } = await import("@/lib/meta/store.server");
    const { updateConnection } = await import("@/lib/db/connections.server");
    const { recordAudit } = await import("@/lib/audit.server");

    if (data.adAccountId) {
      const switched = await activateAdAccount(context.userId, data.adAccountId);
      await recordAudit({
        userId: context.userId,
        source: "dashboard",
        action: "account.switch",
        adAccountId: switched.accountId,
        ok: true,
        detail: { name: switched.name },
      });
    }

    if (data.pageId) {
      const conn = await requireConnection(context.userId);
      await updateConnection(conn.id, { active_page_id: data.pageId });
    }

    return { ok: true };
  });

export const syncMetaAssets = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listConnections, syncAssets } = await import("@/lib/meta/store.server");
    const { getConnectionToken } = await import("@/lib/db/connections.server");
    const connections = await listConnections(context.userId);
    let accounts = 0;
    let pages = 0;
    for (const c of connections) {
      const token = await getConnectionToken(c.id);
      if (!token) continue;
      const result = await syncAssets(context.userId, c.id, token);
      accounts += result.accounts;
      pages += result.pages;
    }
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "connection.sync",
      ok: true,
      detail: { accounts, pages },
    });
    return { accounts, pages };
  });

/** Remove one Meta login (connectionId) or every login when none is given. */
export const disconnectMeta = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ connectionId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { deleteConnections, listAdAccounts, listConnections, updateConnection } =
      await import("@/lib/db/connections.server");
    const { purgeMetaData } = await import("@/lib/meta/purge.server");
    const accountIds = (await listAdAccounts(context.userId))
      .filter((a) => !data.connectionId || a.connection_id === data.connectionId)
      .map((a) => a.account_id);
    await deleteConnections(context.userId, data.connectionId);

    // Keep exactly one login in focus after removing another.
    const remaining = await listConnections(context.userId);
    await purgeMetaData(context.userId, remaining.length ? accountIds : "all");
    if (remaining.length && !remaining.some((c) => c.is_primary)) {
      await updateConnection(remaining[0].id, { is_primary: true });
    }
    const { recordAudit } = await import("@/lib/audit.server");
    await recordAudit({
      userId: context.userId,
      source: "dashboard",
      action: "connection.disconnect",
      ok: true,
      detail: { connectionId: data.connectionId ?? "all" },
    });
    return { ok: true };
  });

export const listMetaCampaigns = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        accountId: z.string().min(1).optional(),
        datePreset: z.string().min(2).max(32).default("last_30d"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { fetchCampaignTree } = await import("@/lib/meta/ads.server");
    const { mirrorAds } = await import("@/lib/meta/mirror.server");
    const conn = await requireConnection(context.userId);
    const accountId = data.accountId ?? conn.active_ad_account_id;
    if (!accountId) throw new Error("Choose an ad account first.");
    const campaigns = await fetchCampaignTree(conn.access_token, accountId, data.datePreset);
    await mirrorAds(context.userId, accountId, conn.active_page_id, campaigns);
    return { accountId, campaigns };
  });

export const updateMetaStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ objectId: z.string().min(1), status: z.enum(["ACTIVE", "PAUSED"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { setStatus } = await import("@/lib/meta/ads.server");
    const { updateSavedAdStatus } = await import("@/lib/db/ads.server");
    const conn = await requireConnection(context.userId);
    await setStatus(conn.access_token, data.objectId, data.status);
    await updateSavedAdStatus(context.userId, data.objectId, data.status);
    return { ok: true };
  });

export const updateMetaBudget = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        objectId: z.string().min(1),
        kind: z.enum(["daily", "lifetime"]),
        minorUnits: z.number().int().min(100).max(100_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { setBudget } = await import("@/lib/meta/ads.server");
    const conn = await requireConnection(context.userId);
    await setBudget(conn.access_token, data.objectId, data.kind, data.minorUnits);
    return { ok: true };
  });

export const updateMetaSchedule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        adsetId: z.string().min(1),
        startTime: z.string().min(4).nullable(),
        endTime: z.string().min(4).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { setSchedule } = await import("@/lib/meta/ads.server");
    const conn = await requireConnection(context.userId);
    await setSchedule(conn.access_token, data.adsetId, data.startTime, data.endTime);
    return { ok: true };
  });

export const updateMetaCreative = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        adId: z.string().min(1),
        accountId: z.string().min(1),
        pageId: z.string().min(1),
        name: z.string().min(1).max(200),
        destination: z.enum(["website", "whatsapp", "facebook_page", "messenger"]),
        destinationValue: z.string().min(1).max(500),
        callToAction: z.string().min(2).max(40),
        headline: z.string().min(1).max(255),
        primaryText: z.string().min(1).max(2000),
        description: z.string().max(500).optional(),
        imageUrl: z.string().url().nullable().optional(),
        videoId: z.string().max(64).nullable().optional(),
        thumbnailHash: z.string().max(128).nullable().optional(),
        thumbnailUrl: z.string().url().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { buildLink, replaceCreative } = await import("@/lib/meta/ads.server");
    const { updateSavedAdCreative } = await import("@/lib/db/ads.server");
    const conn = await requireConnection(context.userId);
    const link = buildLink(data.destination, data.destinationValue);
    const creativeId = await replaceCreative(conn.access_token, {
      accountId: data.accountId,
      adId: data.adId,
      pageId: data.pageId,
      name: data.name,
      link,
      message: data.primaryText,
      headline: data.headline,
      description: data.description,
      callToAction: data.callToAction,
      imageUrl: data.imageUrl ?? null,
      videoId: data.videoId ?? null,
      thumbnailHash: data.thumbnailHash ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
    });

    await updateSavedAdCreative(context.userId, data.adId, {
      destination_type: data.destination,
      destination_url: link,
      whatsapp_number: data.destination === "whatsapp" ? data.destinationValue : null,
      call_to_action: data.callToAction,
      headline: data.headline,
      primary_text: data.primaryText,
      description: data.description ?? null,
    });
    return { creativeId, link };
  });

export const listSavedAds = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listSavedAds: list } = await import("@/lib/db/ads.server");
    return list(context.userId);
  });

export const relaunchSavedAd = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        savedAdId: z.string().uuid(),
        budgetMinorUnits: z.number().int().min(100).max(100_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { copyCampaign } = await import("@/lib/meta/ads.server");
    const { getSavedAdById } = await import("@/lib/db/ads.server");
    const conn = await requireConnection(context.userId);
    const saved = await getSavedAdById(context.userId, data.savedAdId);
    if (!saved) throw new Error("That saved ad no longer exists.");
    if (!saved.external_campaign_id) {
      throw new Error("This ad has no original campaign on Meta, so it cannot be duplicated.");
    }
    const copy = await copyCampaign(conn.access_token, saved.external_campaign_id);
    return { campaignId: copy.copied_campaign_id ?? null };
  });

export const createMetaCampaign = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        accountId: z.string().min(1),
        pageId: z.string().min(1),
        name: z.string().min(2).max(200),
        objective: z.enum(["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS"]),
        budgetKind: z.enum(["daily", "lifetime"]),
        budgetMinorUnits: z.number().int().min(100).max(100_000_000),
        startTime: z.string().min(4).nullable(),
        endTime: z.string().min(4).nullable(),
        countries: z.array(z.string().length(2)).min(1).max(20),
        ageMin: z.number().int().min(13).max(65),
        ageMax: z.number().int().min(13).max(65),
        genders: z.enum(["all", "male", "female"]),
        destination: z.enum(["website", "whatsapp", "facebook_page", "messenger"]),
        destinationValue: z.string().min(1).max(500),
        callToAction: z.string().min(2).max(40),
        headline: z.string().min(1).max(255),
        primaryText: z.string().min(1).max(2000),
        description: z.string().max(500).optional(),
        imageUrl: z.string().url().nullable().optional(),
        videoId: z.string().max(64).nullable().optional(),
        thumbnailHash: z.string().max(128).nullable().optional(),
        thumbnailUrl: z.string().url().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireConnection } = await import("@/lib/meta/store.server");
    const { buildLink, createFullCampaign } = await import("@/lib/meta/ads.server");
    const { upsertSavedAd } = await import("@/lib/db/ads.server");
    const conn = await requireConnection(context.userId);
    const link = buildLink(data.destination, data.destinationValue);
    const created = await createFullCampaign(conn.access_token, {
      accountId: data.accountId,
      pageId: data.pageId,
      name: data.name,
      objective: data.objective,
      budgetKind: data.budgetKind,
      budgetMinorUnits: data.budgetMinorUnits,
      startTime: data.startTime,
      endTime: data.endTime,
      countries: data.countries,
      ageMin: data.ageMin,
      ageMax: Math.max(data.ageMax, data.ageMin),
      genders: data.genders,
      link,
      callToAction: data.callToAction,
      headline: data.headline,
      primaryText: data.primaryText,
      description: data.description,
      imageUrl: data.imageUrl ?? null,
      videoId: data.videoId ?? null,
      thumbnailHash: data.thumbnailHash ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
    });

    await upsertSavedAd({
      user_id: context.userId,
      ad_account_id: data.accountId,
      page_id: data.pageId,
      external_ad_id: created.adId,
      external_adset_id: created.adsetId,
      external_campaign_id: created.campaignId,
      name: `${data.name} — ad`,
      status: "PAUSED",
      headline: data.headline,
      primary_text: data.primaryText,
      description: data.description ?? null,
      call_to_action: data.callToAction,
      destination_type: data.destination,
      destination_url: link,
      whatsapp_number: data.destination === "whatsapp" ? data.destinationValue : null,
      image_url: data.imageUrl ?? null,
    });

    return created;
  });

export const uploadAdCreative = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        accountId: z.string().min(1).optional(),
        filename: z.string().min(1).max(200),
        contentType: z.string().min(3).max(100),
        dataBase64: z.string().min(16).max(14_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getConnection } = await import("@/lib/meta/store.server");
    const { storeCreative } = await import("@/lib/meta/media.server");
    const conn = await getConnection(context.userId);
    const binary = atob(data.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return storeCreative({
      userId: context.userId,
      accountId: data.accountId ?? conn?.active_ad_account_id ?? null,
      token: conn?.access_token ?? null,
      filename: data.filename,
      contentType: data.contentType,
      bytes,
    });
  });

export const listMetaSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listSyncRuns } = await import("@/lib/db/sync.server");
    return listSyncRuns(context.userId, 10);
  });

export const runMetaSyncNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { syncUser } = await import("@/lib/meta/sync.server");
    return syncUser(context.userId, "manual");
  });
