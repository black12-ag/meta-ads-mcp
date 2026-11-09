/**
 * The owner's hard limits for AI requests, as pure checks (client-safe, no I/O).
 * Each check returns a plain-language reason when the request breaks a limit, or null.
 */

export type Limits = {
  max_daily_budget_cents: number | null;
  max_raise_pct: number | null;
  max_changes_per_day: number | null;
  protected_ids: string[];
};

/** shortcut: decimals from Intl, which matches Meta's offsets for USD/ETB/EUR-style currencies; check Meta's table before adding exotic ones. */
const digitsOf = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

export function formatMinor(minor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    fromMinor(minor, currency),
  );
}

export const fromMinor = (minor: number, currency: string) => minor / 10 ** digitsOf(currency);

export function protectedViolation(limits: Limits | null, ids: string[]) {
  const hit = ids.find((id) => limits?.protected_ids.includes(id));
  return hit
    ? `${hit} is protected: AI requests cannot change it. Remove it from Protected on the Goals & limits page.`
    : null;
}

export function budgetViolation(
  limits: Limits | null,
  change: { kind: "daily" | "lifetime"; from: number | null; to: number; currency: string },
) {
  if (!limits) return null;
  const { max_daily_budget_cents: max, max_raise_pct: pct } = limits;
  if (change.kind === "daily" && max != null && change.to > max) {
    return `Above your daily budget limit of ${formatMinor(max, change.currency)}.`;
  }
  if (
    pct != null &&
    change.from != null &&
    change.from > 0 &&
    change.to > change.from * (1 + pct / 100)
  ) {
    return `A raise of more than ${pct}% per change is over your limit (from ${formatMinor(change.from, change.currency)} the most is ${formatMinor(Math.floor(change.from * (1 + pct / 100)), change.currency)}).`;
  }
  return null;
}

export function dailyCountViolation(limits: Limits | null, appliedToday: number) {
  const max = limits?.max_changes_per_day;
  return max != null && appliedToday >= max
    ? `You allow ${max} AI change${max === 1 ? "" : "s"} per day on this ad account, and that many already ran today.`
    : null;
}

/** Meta reports spend as a major-unit string ("12.34"); budgets are minor units. */
export function toMinor(major: string | number, currency: string) {
  return Math.round(Number(major) * 10 ** digitsOf(currency));
}

/** First day (YYYY-MM-DD, UTC) of the budget cycle that contains `today`. */
export function cycleStart(today: Date, startDay: number) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const start =
    today.getUTCDate() >= startDay ? Date.UTC(y, m, startDay) : Date.UTC(y, m - 1, startDay);
  return new Date(start).toISOString().slice(0, 10);
}
