import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReducedMotion } from "framer-motion";
import { getAdsOverview } from "@/lib/overview.functions";
import { money } from "@/lib/meta/constants";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Viral4All Ads" },
      {
        name: "description",
        content:
          "CTR, CPC, CPM and cost per result for every live Meta campaign on your connected ad account.",
      },
      { property: "og:title", content: "Analytics — Viral4All Ads" },
      { property: "og:description", content: "Live Meta Ads efficiency and conversion economics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analytics,
});

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "maximum", label: "All time" },
];

const compact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);

const tooltipStyle = {
  background: "hsl(var(--surface))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

const SLICE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.7)",
  "hsl(var(--primary) / 0.45)",
  "hsl(var(--muted-foreground))",
  "hsl(var(--border))",
];

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="panel p-5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_hsl(var(--primary))]">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <p className="mt-3 text-3xl font-bold tracking-[-0.04em] tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="flex items-end justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="h-64 px-2 py-4">{children}</div>
    </div>
  );
}

function Analytics() {
  const [datePreset, setDatePreset] = useState("last_30d");
  const overviewFn = useServerFn(getAdsOverview);
  const reduced = useReducedMotion();
  const chartMotion = {
    isAnimationActive: !reduced,
    animationDuration: 600,
    animationEasing: "ease-out" as const,
  };
  const query = useQuery({
    queryKey: ["ads-overview", datePreset],
    queryFn: () => overviewFn({ data: { datePreset } }),
    retry: false,
  });

  const data = query.data;
  const connected = data?.connected === true;
  const currency = connected ? data.currency : "USD";
  const t = connected ? data.totals : null;
  const campaigns = connected ? data.campaigns : [];

  const engagementSlices = connected
    ? [
        { name: "Link clicks", value: t!.linkClicks },
        { name: "Engagement", value: t!.engagement },
        { name: "Video views", value: t!.videoViews },
        { name: "Messages", value: t!.messagingStarted },
        { name: "Leads + purchases", value: t!.leads + t!.purchases },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <AppShell
      title="Analytics"
      actions={
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value)}
          aria-label="Date range"
          className="h-8 cursor-pointer rounded-md border border-border bg-surface px-2.5 text-sm font-medium shadow-[0_1px_1px_hsl(var(--shadow)/0.06)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      }
    >
      {query.isLoading ? (
        <div aria-busy="true" aria-label="Loading live data">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[112px] rounded-xl" />
            ))}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      ) : query.error ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
          <Link
            to="/connections"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Review your Meta connection →
          </Link>
        </div>
      ) : !connected ? (
        <div className="panel p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Connect a Meta ad account to see analytics.
          </p>
          <Button asChild className="mt-4">
            <Link to="/connections">Connect Meta Ads</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="CTR"
              value={<CountUp value={t!.ctr} format={(n) => `${n.toFixed(2)}%`} />}
              sub={`${compact(t!.clicks)} clicks`}
            />
            <Kpi
              label="CPC"
              value={<CountUp value={t!.cpc} format={(n) => money(n, currency)} />}
              sub="Average cost per click"
            />
            <Kpi
              label="CPM"
              value={<CountUp value={t!.cpm} format={(n) => money(n, currency)} />}
              sub={`${compact(t!.impressions)} impressions`}
            />
            <Kpi
              label="Cost / result"
              value={<CountUp value={t!.costPerResult} format={(n) => money(n, currency)} />}
              sub={`${compact(t!.results)} results`}
            />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <ChartCard title="Spend by campaign" hint="Top 8 by spend">
              {campaigns.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No delivery in this window.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={campaigns.slice(0, 8).map((c) => ({
                      name: c.campaignName,
                      spend: c.spend / 100,
                    }))}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="spend"
                      fill="hsl(var(--primary))"
                      radius={[6, 6, 0, 0]}
                      {...chartMotion}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Where interactions come from" hint="Live action breakdown">
              {engagementSlices.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No interactions recorded yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={engagementSlices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={82}
                      {...chartMotion}
                    >
                      {engagementSlices.map((_, i) => (
                        <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className="panel mt-6 overflow-x-auto">
            <div className="flex items-end justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Campaign economics</h2>
              <Link to="/meta" className="text-xs text-primary hover:underline">
                Per-ad dashboard →
              </Link>
            </div>
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-left text-xs text-muted-foreground font-medium">
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 text-right font-medium">Spend</th>
                  <th className="px-5 py-3 text-right font-medium">Impressions</th>
                  <th className="px-5 py-3 text-right font-medium">Clicks</th>
                  <th className="px-5 py-3 text-right font-medium">CTR</th>
                  <th className="px-5 py-3 text-right font-medium">CPC</th>
                  <th className="px-5 py-3 text-right font-medium">Results</th>
                  <th className="px-5 py-3 text-right font-medium">Cost / result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                      No campaigns delivered in this window.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((c) => (
                    <tr key={c.campaignId} className="transition-colors hover:bg-accent/50">
                      <td className="px-5 py-3.5">
                        <p className="font-medium">{c.campaignName}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.running}/{c.ads} ads running
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {money(c.spend, currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {compact(c.impressions)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{compact(c.clicks)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{c.ctr.toFixed(2)}%</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {money(c.cpc, currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{compact(c.results)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {money(c.costPerResult, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
