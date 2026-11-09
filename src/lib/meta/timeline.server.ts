import { listAdChangeSeries } from "@/lib/db/ads.server";

const SERIES = ["impressions", "clicks", "results", "spend", "budget"] as const;
export type SeriesKey = (typeof SERIES)[number];

export interface TimelinePoint {
  t: string;
  impressions: number | null;
  clicks: number | null;
  results: number | null;
  spend: number | null;
  budget: number | null;
  interactions: number | null;
}

const toNumber = (v: string | null) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Rebuild a per-ad metric history from the change log. Every sync writes a row
 * whenever a tracked number moves, so replaying them in order gives a timeline
 * without needing a second time-series table.
 */
export async function adTimeline(userId: string, adId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const data = await listAdChangeSeries(userId, [...SERIES], since, 2000, adId);

  // Latest value per metric per hour bucket, carried forward.
  const buckets = new Map<string, Partial<Record<SeriesKey, number>>>();
  for (const row of data) {
    const bucket = new Date(row.created_at).toISOString().slice(0, 13) + ":00";
    const value = toNumber(row.new_value);
    if (value === null) continue;
    const current = buckets.get(bucket) ?? {};
    current[row.field as SeriesKey] = value;
    buckets.set(bucket, current);
  }

  const running: Partial<Record<SeriesKey, number>> = {};
  const points: TimelinePoint[] = [];
  for (const key of [...buckets.keys()].sort()) {
    Object.assign(running, buckets.get(key));
    points.push({
      t: key,
      impressions: running.impressions ?? null,
      clicks: running.clicks ?? null,
      results: running.results ?? null,
      spend: running.spend ?? null,
      budget: running.budget ?? null,
      interactions:
        running.clicks !== undefined || running.results !== undefined
          ? (running.clicks ?? 0) + (running.results ?? 0)
          : null,
    });
  }

  return { adId, days, points };
}
