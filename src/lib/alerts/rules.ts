/**
 * Daily account alert rules. Pure (no I/O): Meta's daily account insights (time_increment=1, spend
 * as major-unit strings), the account status, the campaign tree the sync just fetched and the
 * owner's goals go in, findings come out. "Yesterday" is the last full day in the account's time
 * zone, and the baseline is the 28 days before it.
 */
import { cycleStart, formatMinor, toMinor } from "@/lib/limits";

export type Finding = {
  kind: string;
  severity: "warn" | "critical";
  title: string;
  detail: string;
};

/** One row of act_<id>/insights with time_increment=1. Days without delivery have no row. */
export type InsightRow = {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

/** The part of the synced campaign tree the rules read (MetaCampaign fits it). */
export type CampaignState = {
  id: string;
  status: string;
  adsets: { ads: { name: string; status: string; effectiveStatus: string }[] }[];
};

export type Goals = {
  target_cpr_cents: number | null;
  monthly_budget_cents: number | null;
  cycle_start_day: number;
};

/** A result is the first of these the account got at least 3 of in the baseline. */
const RESULTS = [
  ["offsite_conversion.fb_pixel_purchase", "purchase"],
  ["lead", "lead"],
  ["onsite_conversion.messaging_conversation_started_7d", "conversation"],
  ["link_click", "link click"],
] as const;

/** Meta's account_status codes other than 1 (active). */
const ACCOUNT_STATUS: Record<number, string> = {
  2: "disabled",
  3: "unsettled: a payment failed",
  7: "under risk review",
  8: "pending settlement",
  9: "in a grace period: a payment failed",
  100: "pending closure",
  101: "closed",
};

const DAY_MS = 86_400_000;

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

/** Campaigns set to run (configured status: ones Meta holds back can still spend). */
export const activeCampaignIds = (campaigns: CampaignState[]) =>
  campaigns.filter((c) => c.status === "ACTIVE").map((c) => c.id);

export function accountFindings(c: {
  today: string;
  currency: string;
  rows: InsightRow[];
  accountStatus: number | null;
  campaigns: CampaignState[];
  goals: Goals | null;
}): Finding[] {
  const out: Finding[] = [];
  const money = (minor: number) => formatMinor(minor, c.currency);
  const floor = toMinor(5, c.currency); // smaller amounts are noise
  const byDay = new Map(c.rows.map((r) => [r.date_start, r]));
  const totals = (days: string[]) => {
    const rows = days.flatMap((d) => byDay.get(d) ?? []);
    const add = (read: (r: InsightRow) => number) => rows.reduce((t, r) => t + read(r), 0);
    return {
      spend: add((r) => toMinor(r.spend ?? 0, c.currency)),
      impressions: add((r) => Number(r.impressions ?? 0)),
      clicks: add((r) => Number(r.clicks ?? 0)),
      results: (type: string) =>
        add((r) => Number(r.actions?.find((a) => a.action_type === type)?.value ?? 0)),
    };
  };
  const yesterday = addDays(c.today, -1);
  const y = totals([yesterday]);
  const base = totals(Array.from({ length: 28 }, (_, i) => addDays(c.today, -2 - i)));
  const active = activeCampaignIds(c.campaigns).length;

  // The same weekday in each of the 4 weeks before; a day counts when it had spend, and 3 must.
  const weekdays = [8, 15, 22, 29]
    .map((n) => totals([addDays(c.today, -n)]).spend)
    .filter((s) => s > 0);
  const usual = weekdays.length >= 3 ? weekdays.reduce((a, b) => a + b) / weekdays.length : null;
  const weekday = new Date(Date.parse(yesterday)).toLocaleDateString("en", {
    weekday: "long",
    timeZone: "UTC",
  });
  if (usual !== null && y.spend > 2 * usual && y.spend > floor) {
    out.push({
      kind: "spend_spike",
      severity: "warn",
      title: "Spend jumped yesterday",
      detail: `You spent ${money(y.spend)}, more than twice the usual ${money(usual)} for a ${weekday}.`,
    });
  }
  if (usual !== null && usual > floor && y.spend === 0 && c.accountStatus === 1 && active > 0) {
    out.push({
      kind: "spend_stopped",
      severity: "warn",
      title: "Spend stopped yesterday",
      detail: `Nothing was spent, while a usual ${weekday} spends ${money(usual)} and campaigns are set to run. Check delivery, billing and ad review in Meta Ads Manager.`,
    });
  }

  const result = RESULTS.find(([type]) => base.results(type) >= 3);
  if (result) {
    const [type, label] = result;
    const target = c.goals?.target_cpr_cents ?? null;
    const ref = target ?? base.spend / base.results(type);
    const got = y.results(type);
    // With no results at all, spending 1.5 results' worth is already too much.
    if (y.spend > floor && y.spend > 1.5 * ref * Math.max(got, 1)) {
      const against = target
        ? `your target of ${money(target)}`
        : `${money(ref)} over the 4 weeks before`;
      out.push({
        kind: "cost_per_result",
        severity: "warn",
        title: `Cost per ${label} is high`,
        detail: got
          ? `Yesterday a ${label} cost ${money(y.spend / got)}, against ${against}.`
          : `Yesterday you spent ${money(y.spend)} and got no ${label}s.`,
      });
    }
  }

  if (y.impressions >= 1000 && base.impressions >= 1000) {
    const ctr = (100 * y.clicks) / y.impressions;
    const usualCtr = (100 * base.clicks) / base.impressions;
    if (ctr < 0.6 * usualCtr) {
      out.push({
        kind: "ctr_drop",
        severity: "warn",
        title: "Click-through rate dropped",
        detail: `Yesterday's click-through rate was ${ctr.toFixed(2)}%, against ${usualCtr.toFixed(2)}% over the 4 weeks before.`,
      });
    }
  }

  const stuck = c.campaigns
    .flatMap((x) => x.adsets.flatMap((s) => s.ads))
    .filter(
      (a) =>
        a.status === "ACTIVE" &&
        (a.effectiveStatus === "DISAPPROVED" || a.effectiveStatus === "WITH_ISSUES"),
    );
  if (stuck.length) {
    const names = stuck
      .slice(0, 3)
      .map(
        (a) => `${a.name} (${a.effectiveStatus === "DISAPPROVED" ? "disapproved" : "with issues"})`,
      );
    const more = stuck.length > 3 ? ` and ${stuck.length - 3} more` : "";
    out.push({
      kind: "ad_problems",
      severity: "warn",
      title: `${stuck.length} ad${stuck.length === 1 ? "" : "s"} disapproved or with issues`,
      detail: `${names.join(", ")}${more}. Open them in Meta Ads Manager to see why.`,
    });
  }

  if (c.accountStatus !== null && c.accountStatus !== 1) {
    out.push({
      kind: "account_inactive",
      severity: "critical",
      title: "Ad account is not active",
      detail: `Meta reports it as ${ACCOUNT_STATUS[c.accountStatus] ?? `status ${c.accountStatus}`}. Check Billing and Account quality in Meta Ads Manager.`,
    });
  }

  // Only while something can still spend: once everything is paused there is nothing to guard.
  const budget = c.goals?.monthly_budget_cents ?? null;
  if (c.goals && budget && active > 0) {
    const start = cycleStart(new Date(Date.parse(c.today)), c.goals.cycle_start_day);
    const [yy, mm] = start.split("-").map(Number);
    const cycleDays = (Date.UTC(yy, mm, c.goals.cycle_start_day) - Date.parse(start)) / DAY_MS;
    const fullDays = (Date.parse(c.today) - Date.parse(start)) / DAY_MS;
    const spent = totals(Array.from({ length: fullDays + 1 }, (_, i) => addDays(start, i))).spend;
    // Projected from the full days so far; today is still running.
    const pace = fullDays > 0 ? ((spent - totals([c.today]).spend) / fullDays) * cycleDays : null;
    const used = `${money(spent)} of your ${money(budget)} monthly budget is spent (cycle started ${start}).`;
    if (spent >= budget) {
      out.push({
        kind: "monthly_budget",
        severity: "critical",
        title: "Monthly budget used up",
        detail: `${used} Your active campaigns keep spending until they are paused.`,
      });
    } else if (spent >= 0.8 * budget || (pace !== null && pace >= budget)) {
      out.push({
        kind: "monthly_budget",
        severity: "warn",
        title:
          spent >= 0.8 * budget
            ? `${Math.floor((100 * spent) / budget)}% of the monthly budget used`
            : "On pace to go over the monthly budget",
        detail: pace === null ? used : `${used} At this pace the cycle ends near ${money(pace)}.`,
      });
    }
  }

  // Critical first: the email subject names the first finding.
  return out.sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
}
