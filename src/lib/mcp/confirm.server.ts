/**
 * Human approval for changes that spend money or publish (resume, budget, creative, and pauses the
 * budget guard proposes). A request checks the owner's hard limits and Meta, stores the exact
 * parameters and returns a summary, an approve_url and a confirm_token. The change runs only when
 * the signed-in owner presses Approve on /approve/<id> (limits are checked again then); the AI's
 * confirm_token can only read the outcome. Applied changes keep their before-state for undo.
 * Server-only.
 */
import type { ApiScope } from "@/lib/api-scopes";
import { hashKey } from "@/lib/api-keys.server";
import { findAdAccount } from "@/lib/db/connections.server";
import {
  changesToday,
  getAccountSettings,
  takeChangeSlot,
  type AccountSettings,
} from "@/lib/db/account-settings.server";
import { budgetHoldersOf, familyOf, findSavedAdByExternalId } from "@/lib/db/ads.server";
import {
  claimUndo,
  decidePendingAction,
  findPendingActionByToken,
  insertPendingAction,
  releaseUndo,
  savePendingOutcome,
  type PendingActionRow,
} from "@/lib/db/oauth.server";
import { approvalHeadline, APPROVAL_TITLES, requesterLabel } from "@/lib/approval-summary";
import { notifyApprovalRequested, notifyChangeApplied } from "@/lib/email/notify.server";
import {
  budgetViolation,
  cycleStart,
  dailyCountViolation,
  formatMinor,
  protectedViolation,
  toMinor,
} from "@/lib/limits";
import { graphGet, graphGetAll, graphPost, publicOrigin } from "@/lib/meta/graph.server";
import { requireConnection } from "@/lib/meta/store.server";
import { emitEvent } from "@/lib/webhooks/store.server";

const TTL_MS = 30 * 60_000;

type Action = "resume" | "budget" | "creative" | "pause" | "adset" | "archive";
const SCOPE: Record<Action, ApiScope> = {
  resume: "ads:status",
  budget: "ads:budget",
  creative: "ads:creative",
  pause: "ads:status",
  adset: "ads:edit",
  archive: "ads:status",
};

type MetaObject = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  account_id?: string;
  creative?: { id?: string };
  targeting?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
  bid_amount?: number | string;
};

type Check = { label: string; ok: boolean; detail: string };

/** One Graph call per 50 objects (Meta's multi-id limit). */
async function fetchObjects(token: string, ids: string[], fields: string) {
  const out: MetaObject[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const byId = await graphGet<Record<string, MetaObject>>("", token, {
      ids: chunk.join(","),
      fields,
    });
    out.push(...chunk.map((id) => byId[id] ?? { id }));
  }
  return out;
}

const approveUrl = (base: string, id: string) => `${base}/approve/${id}`;
const SITE_ORIGIN = () => publicOrigin("https://ads.viral4all.com");

/** Who asked: "key:<prefix>" or "app:<registered name>" (see McpCaller.requester). */
type Requester = { userId: string; base: string; requester?: string | null };

const blocked = (reason: string) => new Error(`Blocked by your limits: ${reason}`);

/**
 * The owner's limits for these objects (read from Meta with account_id); throws a plain reason
 * when one is broken. A pause only stops spend, so only "protected" applies to it. A copy leaves
 * the original untouched, so "protected" doesn't apply to it. `take` counts the change toward the
 * per-day cap; requests only check it.
 */
async function enforceLimits(
  userId: string,
  objects: MetaObject[],
  budget?: { kind: "daily" | "lifetime"; from: number | null; to: number; currency: string },
  opts: { pause?: boolean; take?: boolean; copy?: boolean; resume?: boolean } = {},
) {
  const stop = (reason: string) => {
    emitEvent(
      userId,
      "request.blocked",
      { reason, ids: objects.map((o) => o.id) },
      `Blocked by your limits: ${reason}`,
    );
    return blocked(reason);
  };
  const family = await familyOf(
    userId,
    objects.map((o) => o.id),
  );
  const accounts = new Set(objects.map((o) => o.account_id ?? family.accountOf.get(o.id) ?? null));
  if (accounts.has(null)) throw stop("couldn't tell which ad account this belongs to.");
  if (accounts.size !== 1) throw stop("send changes for one ad account at a time.");
  const [accountId] = accounts as Set<string>;
  const settings = await getAccountSettings(userId, accountId);
  if (settings && !opts.copy) {
    const reason = protectedViolation(settings, family.ids);
    if (reason) throw stop(reason);
    // Parents come from our mirror; an object it hasn't seen could sit in a protected campaign.
    const unknown = objects.find((o) => !family.accountOf.has(o.id));
    if (unknown && settings.protected_ids.length) {
      throw stop(
        `${unknown.id} isn't synced yet, so it can't be checked against your protected campaigns. Sync on the dashboard, then try again.`,
      );
    }
  }
  if (opts.pause) return { accountId, settings };
  const over = settings && budget ? budgetViolation(settings, budget) : null;
  if (over) throw stop(over);
  if (opts.resume && settings?.max_daily_budget_cents != null) {
    const reason = await resumeOverCap(userId, accountId, objects, settings.max_daily_budget_cents);
    if (reason) throw stop(reason);
  }
  const max = settings?.max_changes_per_day ?? null;
  // Approvals and direct changes take a slot atomically; a request only looks.
  const full = opts.take
    ? !(await takeChangeSlot(userId, accountId, max))
    : max != null && (await changesToday(userId, accountId)) >= max;
  const reason = full ? dailyCountViolation(settings, Number(max)) : null;
  if (reason) throw stop(reason);
  return { accountId, settings };
}

/**
 * Resuming turns spend back on, so every ad set and campaign budget it would run under must fit
 * the daily cap, including budgets the owner set higher in Ads Manager.
 */
async function resumeOverCap(
  userId: string,
  accountId: string,
  objects: MetaObject[],
  max: number,
) {
  const ids = objects.map((o) => o.id);
  const holders = await budgetHoldersOf(userId, ids);
  const unknown = ids.find((id) => !holders.known.has(id));
  if (unknown) {
    return `${unknown} isn't synced yet, so its budget can't be checked against your daily limit. Sync on the dashboard, then try again.`;
  }
  const { access_token } = await requireConnection(userId);
  const fields = "daily_budget,lifetime_budget,start_time,end_time";
  // An ad never changes ad set and an ad set never changes campaign, so the mirror's parents
  // hold; a campaign's ad sets can, so those are read live. One request per object type:
  // Meta rejects a field that one of the ids doesn't have.
  const budgets = [
    ...(holders.adsets.length ? await fetchObjects(access_token, holders.adsets, fields) : []),
    ...(holders.campaigns.length
      ? await fetchObjects(access_token, holders.campaigns, fields)
      : []),
  ];
  for (const campaign of holders.campaigns) {
    budgets.push(
      ...(await graphGetAll<MetaObject>(`${campaign}/adsets`, access_token, {
        fields,
        limit: 200,
      })),
    );
  }
  const high = budgets.map(perDay).find((v) => Number.isNaN(v) || v > max);
  if (high === undefined) return null;
  if (Number.isNaN(high)) return "couldn't read a budget this would spend under.";
  const currency = (await findAdAccount(userId, accountId))?.currency ?? "USD";
  return budgetViolation(
    {
      max_daily_budget_cents: max,
      max_raise_pct: null,
      max_changes_per_day: null,
      protected_ids: [],
    },
    { kind: "daily", from: null, to: Math.ceil(high), currency },
  );
}

/** What a budget can spend per day; a lifetime budget is spread over the days it has left. */
export function perDay(o: MetaObject, now = Date.now()) {
  // Meta sends "0" (a truthy string) for the budget kind an object doesn't use.
  if (Number(o.daily_budget) > 0) return Number(o.daily_budget);
  if (!(Number(o.lifetime_budget) > 0)) return 0;
  const start = Math.max(now, o.start_time ? Date.parse(o.start_time) : now);
  const end = o.end_time ? Date.parse(o.end_time) : NaN;
  return Number(o.lifetime_budget) / Math.max(1, Math.ceil((end - start) / 86_400_000));
}

/** The same limits for changes that run without an approval page (REST API keys, AI pauses). */
export async function enforceDirect(
  userId: string,
  ids: string[],
  change: {
    pause?: boolean;
    resume?: boolean;
    copy?: boolean;
    budget?: { kind: "daily" | "lifetime"; to: number };
  } = {},
) {
  const conn = await requireConnection(userId);
  const field = change.budget?.kind === "lifetime" ? "lifetime_budget" : "daily_budget";
  const objects = await fetchObjects(conn.access_token, ids, `account_id,${field}`);
  const accountId = objects[0]?.account_id;
  const currency = accountId
    ? ((await findAdAccount(userId, accountId))?.currency ?? "USD")
    : "USD";
  const budget = change.budget && {
    ...change.budget,
    from: objects[0][field] ? Number(objects[0][field]) : null,
    currency,
  };
  await enforceLimits(userId, objects, budget, {
    pause: change.pause,
    resume: change.resume,
    copy: change.copy,
    take: !change.pause,
  });
}

/**
 * A new campaign from an AI or API key: its budget must fit the daily cap (a lifetime budget is
 * spread over its days) and it counts toward the changes per day. Without this, creating a
 * campaign and then resuming it would skip the cap.
 */
export async function enforceNewCampaign(
  userId: string,
  input: {
    budgetKind: "daily" | "lifetime";
    budgetMinorUnits: number;
    startTime?: string | null;
    endTime?: string | null;
  },
) {
  const conn = await requireConnection(userId);
  const accountId = conn.active_ad_account_id;
  if (!accountId) throw new Error("No ad account selected.");
  const settings = await getAccountSettings(userId, accountId);
  const currency = (await findAdAccount(userId, accountId))?.currency ?? "USD";
  // Spread over the days it can really spend: Meta starts a past start time now, and
  // createFullCampaign runs a lifetime budget for 30 days when no end is given.
  const now = Date.now();
  const start = Math.max(now, input.startTime ? Date.parse(input.startTime) : now);
  const end = input.endTime ? Date.parse(input.endTime) : now + 30 * 86_400_000;
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error("Invalid start or end time.");
  const days =
    input.budgetKind === "lifetime" ? Math.max(1, Math.ceil((end - start) / 86_400_000)) : 1;
  const stop = (reason: string) => {
    emitEvent(userId, "request.blocked", { reason, ids: [] }, `Blocked by your limits: ${reason}`);
    return blocked(reason);
  };
  const over = budgetViolation(settings, {
    kind: "daily",
    from: null,
    to: Math.ceil(input.budgetMinorUnits / days),
    currency,
  });
  if (over) throw stop(over);
  const max = settings?.max_changes_per_day ?? null;
  if (!(await takeChangeSlot(userId, accountId, max))) {
    throw stop(dailyCountViolation(settings, Number(max)) ?? "daily change limit reached.");
  }
}

function limitsCheck(settings: AccountSettings | null): Check {
  return settings
    ? { label: "Your limits", ok: true, detail: "Within your Goals & limits." }
    : {
        label: "Your limits",
        ok: false,
        detail: "No limits set for this ad account. Set them on the Goals & limits page.",
      };
}

/** Spend so far in the owner's budget cycle against the monthly budget, when one is set. */
async function headroomCheck(
  token: string,
  accountId: string,
  settings: AccountSettings | null,
  currency: string,
): Promise<Check | null> {
  if (!settings?.monthly_budget_cents) return null;
  const since = cycleStart(new Date(), settings.cycle_start_day);
  const until = new Date().toISOString().slice(0, 10);
  const res = await graphGet<{ data?: Array<{ spend?: string }> }>(
    `act_${accountId}/insights`,
    token,
    {
      fields: "spend",
      time_range: JSON.stringify({ since, until }),
    },
  ).catch(() => null);
  if (!res)
    return {
      label: "Monthly budget",
      ok: false,
      detail: "Couldn't read this cycle's spend from Meta.",
    };
  const spent = toMinor(res.data?.[0]?.spend ?? 0, currency);
  const budget = settings.monthly_budget_cents;
  return {
    label: "Monthly budget",
    ok: spent < budget * 0.8,
    detail: `${formatMinor(spent, currency)} of ${formatMinor(budget, currency)} spent since ${since}.`,
  };
}

async function pending(
  caller: Requester,
  action: Action,
  params: unknown,
  summary: Record<string, unknown>,
  accountId: string | null,
  ttlMs = TTL_MS,
) {
  const token =
    "cfm_" + Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const { id } = await insertPendingAction({
    token_hash: await hashKey(token),
    user_id: caller.userId,
    action,
    scope: SCOPE[action],
    params,
    summary,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    requested_via: caller.requester ?? null,
    account_id: accountId,
  });
  void notifyApprovalRequested(caller.userId, {
    id,
    actionTitle: APPROVAL_TITLES[action] ?? action,
    headline: approvalHeadline(action, summary),
    requester: requesterLabel(caller.requester ?? null),
    // Email links never come from the request's Host header.
    base: SITE_ORIGIN(),
    expiresInMinutes: ttlMs / 60_000,
  });
  const headline = approvalHeadline(action, summary);
  emitEvent(
    caller.userId,
    "approval.requested",
    {
      approval_id: id,
      action,
      account_id: accountId,
      headline,
      requested_by: requesterLabel(caller.requester ?? null),
      approve_url: approveUrl(SITE_ORIGIN(), id),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      summary,
    },
    `Approval needed: ${headline}. Approve or reject: ${approveUrl(SITE_ORIGIN(), id)}`,
  );
  return {
    status: "approval_required",
    approve_url: approveUrl(caller.base, id),
    confirm_token: token,
    expires_in_seconds: ttlMs / 1000,
    summary,
    next_step:
      "Nothing has changed. Show the user this summary and approve_url. The change runs only when they open the link, sign in and press Approve. After they say they did, call meta_confirm_action with confirm_token to read the outcome.",
  };
}

export async function previewResume(caller: Requester, ids: string[]) {
  const conn = await requireConnection(caller.userId);
  const objects = await fetchObjects(
    conn.access_token,
    ids,
    "name,status,effective_status,account_id",
  );
  const { accountId, settings } = await enforceLimits(caller.userId, objects, undefined, {
    resume: true,
  });
  const currency = accountId
    ? ((await findAdAccount(caller.userId, accountId))?.currency ?? "USD")
    : "USD";
  const headroom = accountId
    ? await headroomCheck(conn.access_token, accountId, settings, currency)
    : null;
  return pending(
    caller,
    "resume",
    { ids },
    {
      change: "Set to ACTIVE: these start delivering and spending again.",
      objects: objects.map((o) => ({
        id: o.id,
        name: o.name ?? null,
        current_status: o.effective_status ?? o.status ?? null,
      })),
      checks: [limitsCheck(settings), ...(headroom ? [headroom] : [])],
    },
    accountId,
  );
}

export async function previewBudget(
  caller: Requester,
  objectId: string,
  kind: "daily" | "lifetime",
  minorUnits: number,
) {
  const conn = await requireConnection(caller.userId);
  const [obj] = await fetchObjects(
    conn.access_token,
    [objectId],
    "name,daily_budget,lifetime_budget,account_id",
  );
  const account = obj.account_id ? await findAdAccount(caller.userId, obj.account_id) : null;
  const currency = account?.currency ?? "USD";
  const field = kind === "daily" ? "daily_budget" : "lifetime_budget";
  const current = Number(obj[field]) > 0 ? Number(obj[field]) : null;
  const { accountId, settings } = await enforceLimits(caller.userId, [obj], {
    kind,
    from: current,
    to: minorUnits,
    currency,
  });
  // Meta checks the change without applying it; a rejected change never reaches the user.
  await graphPost(objectId, conn.access_token, {
    [field]: minorUnits,
    execution_options: ["validate_only"],
  });
  const headroom = accountId
    ? await headroomCheck(conn.access_token, accountId, settings, currency)
    : null;
  return pending(
    caller,
    "budget",
    { objectId, kind, minorUnits },
    {
      object: { id: objectId, name: obj.name ?? null },
      budget: kind,
      currency,
      from: current === null ? null : formatMinor(current, currency),
      to: formatMinor(minorUnits, currency),
      meta_validation: "passed",
      checks: [limitsCheck(settings), ...(headroom ? [headroom] : [])],
    },
    accountId,
  );
}

/** Creative fields the request may change, mapped to the mirrored ad's current values. */
const CREATIVE_FIELDS: Record<string, string> = {
  destination: "destination_type",
  destinationValue: "destination_url",
  headline: "headline",
  primaryText: "primary_text",
  callToAction: "call_to_action",
  imageUrl: "image_url",
};

export async function previewCreative(
  caller: Requester,
  input: Record<string, unknown> & { adId: string },
) {
  const conn = await requireConnection(caller.userId);
  const [ad] = await fetchObjects(
    conn.access_token,
    [input.adId],
    "name,effective_status,account_id",
  );
  const { accountId, settings } = await enforceLimits(caller.userId, [ad]);
  const saved = (await findSavedAdByExternalId(caller.userId, input.adId)) as Record<
    string,
    unknown
  > | null;
  const changes = Object.entries(input)
    .filter(([k, v]) => k !== "adId" && v != null)
    .map(([k, to]) => {
      const col =
        CREATIVE_FIELDS[k] === "destination_url" && saved?.destination_type === "whatsapp"
          ? "whatsapp_number"
          : CREATIVE_FIELDS[k];
      return { field: k, from: col && saved ? (saved[col] ?? null) : null, to };
    });
  return pending(
    caller,
    "creative",
    input,
    {
      ad: { id: input.adId, name: ad.name ?? null, current_status: ad.effective_status ?? null },
      changes,
      note: "A live ad gets a new creative and goes back through Meta review.",
      checks: [limitsCheck(settings)],
    },
    accountId,
  );
}

export type AdsetEdit = {
  name?: string;
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: "all" | "male" | "female";
  interests?: Array<{ id: string; name: string }>;
  endTime?: string;
  bidAmountMinorUnits?: number;
};

const ADSET_EDIT_FIELDS = "name,targeting,end_time,bid_amount,account_id";
const GENDER_CODES = { male: [1], female: [2] } as const;
const genderOf = (g: unknown) =>
  Array.isArray(g) && g.length === 1 ? (g[0] === 1 ? "male" : "female") : "all";
const interestNames = (spec: unknown) =>
  (Array.isArray(spec) ? spec : [])
    .flatMap((f: { interests?: Array<{ name?: string }> }) => f.interests ?? [])
    .map((i) => i.name)
    .join(", ") || null;

/**
 * What an ad set edit sends to Meta, how it reads for the owner, and what puts it back (null when
 * it can't be undone: Meta has no way to remove an end time that wasn't there before).
 */
export function adsetChange(current: MetaObject, edit: AdsetEdit) {
  const t: Record<string, unknown> = { ...(current.targeting ?? {}) };
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const body: Record<string, unknown> = {};
  const undo: Record<string, unknown> = {};
  const geo = t.geo_locations as { countries?: string[] } | undefined;
  if (edit.countries) {
    changes.push({
      field: "countries",
      from: geo?.countries?.join(", ") ?? null,
      to: edit.countries.join(", "),
    });
    t.geo_locations = { countries: edit.countries };
  }
  if (edit.ageMin != null) {
    changes.push({ field: "age from", from: t.age_min ?? null, to: edit.ageMin });
    t.age_min = edit.ageMin;
  }
  if (edit.ageMax != null) {
    changes.push({ field: "age to", from: t.age_max ?? null, to: edit.ageMax });
    t.age_max = edit.ageMax;
  }
  if (edit.genders) {
    changes.push({ field: "genders", from: genderOf(t.genders), to: edit.genders });
    if (edit.genders === "all") delete t.genders;
    else t.genders = GENDER_CODES[edit.genders];
  }
  if (edit.interests) {
    changes.push({
      field: "interests",
      from: interestNames(t.flexible_spec),
      to: edit.interests.map((i) => i.name).join(", ") || "none",
    });
    if (edit.interests.length) t.flexible_spec = [{ interests: edit.interests }];
    else delete t.flexible_spec;
  }
  if (changes.length) {
    body.targeting = t;
    undo.targeting = current.targeting ?? {};
  }
  if (edit.name) {
    changes.push({ field: "name", from: current.name ?? null, to: edit.name });
    body.name = edit.name;
    undo.name = current.name;
  }
  if (edit.endTime) {
    changes.push({ field: "end time", from: current.end_time ?? null, to: edit.endTime });
    body.end_time = edit.endTime;
    undo.end_time = current.end_time;
  }
  if (edit.bidAmountMinorUnits != null) {
    changes.push({
      field: "bid cap",
      from: current.bid_amount ?? null,
      to: edit.bidAmountMinorUnits,
    });
    body.bid_amount = edit.bidAmountMinorUnits;
    undo.bid_amount = current.bid_amount;
  }
  if (!changes.length) throw new Error("Nothing to change: pass at least one field to edit.");
  const undoable =
    !(edit.endTime && !current.end_time) && (!("bid_amount" in body) || current.bid_amount != null);
  return { body, changes, undo: undoable ? undo : null };
}

/**
 * Meta's own names for these interest ids. The approval page shows names, Meta applies ids, so the
 * names an AI supplies are never trusted.
 */
async function verifiedInterests(token: string, interests: Array<{ id: string; name: string }>) {
  if (!interests.length) return interests;
  const res = await graphGet<{
    data?: Array<{ id?: string | number; name?: string; valid?: boolean }>;
  }>("search", token, {
    type: "adinterestvalid",
    interest_fbid_list: JSON.stringify(interests.map((i) => i.id)),
  });
  const names = new Map(
    (res.data ?? [])
      .filter((r) => r.valid !== false && r.id != null && r.name)
      .map((r) => [String(r.id), String(r.name)]),
  );
  return interests.map(({ id }) => {
    const name = names.get(id);
    if (!name)
      throw new Error(`${id} isn't a valid Meta interest. Find it with meta_search_targeting.`);
    return { id, name };
  });
}

export async function previewAdset(caller: Requester, input: AdsetEdit & { adsetId: string }) {
  const conn = await requireConnection(caller.userId);
  const { adsetId, ...asked } = input;
  const edit = asked.interests
    ? { ...asked, interests: await verifiedInterests(conn.access_token, asked.interests) }
    : asked;
  const [current] = await fetchObjects(conn.access_token, [adsetId], ADSET_EDIT_FIELDS);
  const { accountId, settings } = await enforceLimits(caller.userId, [current]);
  const { body, changes, undo } = adsetChange(current, edit);
  // Meta checks the edit without applying it, as for budgets.
  await graphPost(adsetId, conn.access_token, { ...body, execution_options: ["validate_only"] });
  return pending(
    caller,
    "adset",
    { adsetId, ...edit },
    {
      adset: { id: adsetId, name: current.name ?? null },
      changes,
      note: undo ? "You can undo this after it runs." : "This edit can't be undone automatically.",
      meta_validation: "passed",
      checks: [limitsCheck(settings)],
    },
    accountId,
  );
}

/** Archiving is for good: no undo, so it always goes through the review page. */
export async function previewArchive(caller: Requester, ids: string[]) {
  const conn = await requireConnection(caller.userId);
  const objects = await fetchObjects(conn.access_token, ids, "name,status,account_id");
  const { accountId, settings } = await enforceLimits(caller.userId, objects, undefined, {
    pause: true,
  });
  return pending(
    caller,
    "archive",
    { ids },
    {
      change:
        "Archive: these stop for good and leave your active lists. This can't be undone here.",
      objects: objects.map((o) => ({
        id: o.id,
        name: o.name ?? null,
        current_status: o.status ?? null,
      })),
      checks: [limitsCheck(settings)],
    },
    accountId,
  );
}

/**
 * Budget guard: ask the owner to pause these campaigns. Pausing only stops spend. The guard runs
 * in the background, often at night, so its request waits a day instead of 30 minutes.
 */
export async function proposePause(caller: Requester, campaignIds: string[], reason: string) {
  const conn = await requireConnection(caller.userId);
  const objects = await fetchObjects(conn.access_token, campaignIds, "name,status,account_id");
  return pending(
    caller,
    "pause",
    { ids: campaignIds },
    {
      change: "Set to PAUSED: these stop delivering and spending.",
      reason,
      objects: objects.map((o) => ({
        id: o.id,
        name: o.name ?? null,
        current_status: o.status ?? null,
      })),
    },
    objects.find((o) => o.account_id)?.account_id ?? null,
    24 * 60 * 60_000,
  );
}

/** Re-check limits at approval time, capture the before-state, run the change, read it back. */
async function execute(userId: string, row: PendingActionRow) {
  const actions = await import("@/lib/meta/actions.server");
  const conn = await requireConnection(userId);
  const p = row.params as Record<string, never>;

  if (row.action === "resume" || row.action === "pause") {
    const before = await fetchObjects(conn.access_token, p.ids, "status,account_id");
    if (row.action === "resume") {
      await enforceLimits(userId, before, undefined, { take: true, resume: true });
    }
    const target = row.action === "resume" ? "ACTIVE" : "PAUSED";
    const result = await actions.setStatusBulk(userId, p.ids, target);
    const after = await fetchObjects(conn.access_token, p.ids, "status");
    return {
      before: { statuses: Object.fromEntries(before.map((o) => [o.id, o.status ?? null])) },
      result: { ...result, verified: after.map((o) => ({ id: o.id, status: o.status ?? null })) },
    };
  }
  if (row.action === "budget") {
    const field = p.kind === "daily" ? "daily_budget" : "lifetime_budget";
    const [now] = await fetchObjects(conn.access_token, [p.objectId], `${field},account_id`);
    const from = Number(now[field]) > 0 ? Number(now[field]) : null;
    const currency = String(row.summary.currency ?? "USD");
    await enforceLimits(
      userId,
      [now],
      { kind: p.kind, from, to: p.minorUnits, currency },
      { take: true },
    );
    const result = await actions.setObjectBudget(userId, p.objectId, p.kind, p.minorUnits);
    const [after] = await fetchObjects(conn.access_token, [p.objectId], field);
    return {
      before: { minorUnits: from },
      result: { ...result, verified: Number(after[field]) === Number(p.minorUnits) },
    };
  }
  if (row.action === "creative") {
    const [now] = await fetchObjects(conn.access_token, [p.adId], "creative{id},account_id");
    await enforceLimits(userId, [now], undefined, { take: true });
    const result = await actions.updateAdCreative(userId, row.params as never);
    return { before: { creative_id: now.creative?.id ?? null }, result: { result } };
  }
  if (row.action === "adset") {
    const { adsetId, ...edit } = row.params as AdsetEdit & { adsetId: string };
    const [current] = await fetchObjects(conn.access_token, [adsetId], ADSET_EDIT_FIELDS);
    await enforceLimits(userId, [current], undefined, { take: true });
    const { body, undo } = adsetChange(current, edit);
    await graphPost(adsetId, conn.access_token, body);
    return { before: undo, result: { ok: true, adsetId, changed: Object.keys(body) } };
  }
  if (row.action === "archive") {
    const objects = await fetchObjects(conn.access_token, p.ids, "account_id");
    await enforceLimits(userId, objects, undefined, { pause: true });
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of p.ids as string[]) {
      try {
        await graphPost(id, conn.access_token, { status: "ARCHIVED" });
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { before: null, result: { archived: results.filter((r) => r.ok).length, results } };
  }
  throw new Error(`Unknown action "${row.action}".`);
}

/** Called from the signed-in approval page: decide once, run on approval, store the outcome. */
export async function decide(
  userId: string,
  id: string,
  approve: boolean,
  note: string | null = null,
) {
  const row = await decidePendingAction(id, userId, approve ? "approved" : "rejected", note);
  if (!row) throw new Error("This request is unknown, expired or already decided.");
  const headline = approvalHeadline(row.action, row.summary);
  const event = (
    type: "approval.approved" | "approval.rejected" | "approval.failed",
    text: string,
    extra: Record<string, unknown> = {},
  ) =>
    emitEvent(
      userId,
      type,
      {
        approval_id: id,
        action: row.action,
        account_id: row.account_id,
        headline,
        owner_note: note,
        url: approveUrl(SITE_ORIGIN(), id),
        ...extra,
      },
      text,
    );
  if (!approve) {
    event("approval.rejected", `Rejected: ${headline}.`);
    return { decision: "rejected" as const };
  }
  const receipt = (ok: boolean, error: string | null) => {
    void notifyChangeApplied(userId, { id, headline, ok, error, base: SITE_ORIGIN() });
    if (ok) event("approval.approved", `Approved and applied: ${headline}.`);
    else event("approval.failed", `Approved, but it didn't run: ${headline}. ${error}`, { error });
  };
  try {
    const { before, result } = await execute(userId, row);
    await savePendingOutcome(id, result, null, before);
    receipt(true, null);
    return { decision: "approved" as const, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The change failed.";
    await savePendingOutcome(id, null, message);
    receipt(false, message);
    return { decision: "approved" as const, error: message };
  }
}

/** The owner's confirmed click on our site puts things back as they were before the change. */
export async function undo(userId: string, id: string) {
  const row = await claimUndo(id, userId);
  if (!row)
    throw new Error(
      "This change can't be undone (not applied, already undone, or no before-state).",
    );
  const actions = await import("@/lib/meta/actions.server");
  const p = row.params as Record<string, never>;
  const b = row.before_state as Record<string, never>;
  try {
    if (row.action === "budget") {
      if (b.minorUnits == null) throw new Error("There was no earlier budget to go back to.");
      await actions.setObjectBudget(userId, p.objectId, p.kind, b.minorUnits);
    } else if (row.action === "resume" || row.action === "pause") {
      const statuses = b.statuses as Record<string, string | null>;
      for (const target of ["ACTIVE", "PAUSED"] as const) {
        const ids = Object.keys(statuses).filter((k) => statuses[k] === target);
        if (ids.length) await actions.setStatusBulk(userId, ids, target);
      }
    } else if (row.action === "adset") {
      const conn = await requireConnection(userId);
      await graphPost(p.adsetId, conn.access_token, b);
    } else if (row.action === "creative") {
      if (!b.creative_id) throw new Error("The earlier creative is unknown.");
      const conn = await requireConnection(userId);
      await graphPost(p.adId, conn.access_token, { creative: { creative_id: b.creative_id } });
    } else {
      throw new Error(`Unknown action "${row.action}".`);
    }
    emitEvent(
      userId,
      "change.undone",
      {
        approval_id: id,
        action: row.action,
        account_id: row.account_id,
        headline: approvalHeadline(row.action, row.summary),
        url: approveUrl(SITE_ORIGIN(), id),
      },
      `Undone: ${approvalHeadline(row.action, row.summary)}.`,
    );
    return { ok: true as const };
  } catch (err) {
    await releaseUndo(id);
    throw err;
  }
}

/** meta_confirm_action: the AI reads the outcome. It can never make the change itself. */
export async function outcome(caller: Requester, token: string) {
  const row = await findPendingActionByToken(await hashKey(token), caller.userId);
  if (!row) throw new Error("Unknown confirm_token. Ask for the change again.");
  const note = row.decision_note ? { owner_note: row.decision_note } : {};
  if (row.decision === "rejected")
    return { status: "rejected", note: "The user rejected this change.", ...note };
  if (row.decision === "approved") {
    return row.error
      ? { status: "failed", error: row.error, ...note }
      : {
          status: row.undone_at ? "undone" : "done",
          action: row.action,
          result: row.result,
          ...note,
        };
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    throw new Error("This request expired before it was approved. Ask for the change again.");
  }
  return {
    status: "waiting_for_approval",
    approve_url: approveUrl(caller.base, row.id),
    next_step: "Ask the user to open approve_url, sign in and press Approve, then check again.",
  };
}
