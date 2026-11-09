import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import { getAdTimeline } from "@/lib/meta-insights.functions";

const METRICS = [
  { key: "impressions", label: "Impressions", color: "hsl(var(--chart-1))" },
  { key: "interactions", label: "Interactions", color: "hsl(var(--chart-2))" },
  { key: "clicks", label: "Clicks", color: "hsl(var(--chart-3))" },
  { key: "spend", label: "Spend", color: "hsl(var(--chart-4))" },
  { key: "budget", label: "Budget", color: "hsl(var(--muted-foreground))" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

/** Per-ad performance history, rebuilt from the sync change log. */
export function AdTimelineChart({ adId }: { adId: string }) {
  const [metric, setMetric] = useState<MetricKey>("impressions");
  const fetchTimeline = useServerFn(getAdTimeline);

  const { data, isLoading } = useQuery({
    queryKey: ["ad-timeline", adId],
    queryFn: () => fetchTimeline({ data: { adId, days: 30 } }),
    retry: false,
  });

  const points = (data?.points ?? []).map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
    }),
  }));
  const active = METRICS.find((m) => m.key === metric)!;

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <TrendingUp className="size-3.5" /> 30-day timeline
        </p>
        <div className="ml-auto flex flex-wrap gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                metric === m.key
                  ? "bg-nav-button text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading history…
        </p>
      ) : points.length < 2 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">Not enough history yet.</p>
      ) : (
        <div className="mt-3 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${adId}-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={active.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={active.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={40}
                // 12K, not 12000, so the numbers fit the axis
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)
                }
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={active.label}
                stroke={active.color}
                strokeWidth={2}
                fill={`url(#grad-${adId}-${metric})`}
                connectNulls
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
