import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useState } from "react";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { AskAiPrompts } from "@/components/AskAiPrompts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/CountUp";
import { AlertsCard } from "@/components/AlertsCard";
import { GettingStarted } from "@/components/GettingStarted";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncStatusBar } from "@/components/meta/SyncStatusBar";
import { getAccountTimeline, getAdsOverview } from "@/lib/overview.functions";
import { money } from "@/lib/meta/constants";
import { csvFilename, downloadCsv } from "@/lib/export-csv";
import { countWaitingApprovals } from "@/lib/approvals.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Viral4All Ads" },
      {
        name: "description",
        content: "Live Meta Ads spend, reach, clicks and results for your connected ad account.",
      },
      { property: "og:title", content: "Overview — Viral4All Ads" },
      {
        property: "og:description",
        content: "Live Meta Ads spend, reach, clicks and results in one console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
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

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[22px] leading-7 font-semibold tracking-[-0.01em] tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const TrendChart = lazy(() => import("@/components/TrendChart"));

const METRICS = [
  { key: "spend", label: "Spend" },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "results", label: "Results" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

function Dashboard() {
  const [datePreset, setDatePreset] = useState("last_30d");
  const [metric, setMetric] = useState<MetricKey>("spend");
  const countFn = useServerFn(countWaitingApprovals);
  const waiting = useQuery({
    queryKey: ["approvals-count"],
    queryFn: () => countFn({}),
    retry: false,
  });
  const overviewFn = useServerFn(getAdsOverview);
  const timelineFn = useServerFn(getAccountTimeline);

  const overviewQuery = useQuery({
    queryKey: ["ads-overview", datePreset],
    queryFn: () => overviewFn({ data: { datePreset } }),
    retry: false,
  });
  const timelineQuery = useQuery({
    queryKey: ["account-timeline"],
    queryFn: () => timelineFn({ data: { days: 30 } }),
    retry: false,
  });

  const data = overviewQuery.data;
  const connected = data?.connected === true;
  const totals = connected ? data.totals : null;
  const currency = connected ? data.currency : "USD";
  const points = timelineQuery.data ?? [];

  function exportCsv() {
    if (!connected) return;
    const rows: (string | number)[][] = [
      ["Viral4All Ads — Meta Ads overview"],
      ["Ad account", data.accountId, "Range", datePreset],
      [],
      [
        "Campaign",
        "Ads",
        "Running",
        "Spend",
        "Impressions",
        "Reach",
        "Clicks",
        "Results",
        "CTR %",
        "CPC",
      ],
      ...data.campaigns.map((c) => [
        c.campaignName,
        c.ads,
        c.running,
        (c.spend / 100).toFixed(2),
        c.impressions,
        c.reach,
        c.clicks,
        c.results,
        c.ctr.toFixed(2),
        (c.cpc / 100).toFixed(2),
      ]),
    ];
    downloadCsv(csvFilename("meta-overview", datePreset), rows);
  }

  return (
    <AppShell
      title="Home"
      actions={
        <div className="flex flex-wrap gap-2">
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
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => {
              overviewQuery.refetch();
              timelineQuery.refetch();
            }}
            disabled={overviewQuery.isFetching}
          >
            <RefreshCw className={overviewQuery.isFetching ? "animate-spin" : ""} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={exportCsv} disabled={!connected}>
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <SyncStatusBar />

      <GettingStarted />
      <AlertsCard />
      {overviewQuery.isLoading ? (
        <div aria-busy="true" aria-label="Loading live data">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-6 h-72 rounded-xl" />
        </div>
      ) : overviewQuery.error ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-destructive">{(overviewQuery.error as Error).message}</p>
          <Link
            to="/connections"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Review your Meta connection →
          </Link>
        </div>
      ) : !connected ? (
        <div className="panel p-10 text-center">
          <p className="text-sm text-muted-foreground">Connect Meta to see your numbers.</p>
          <Button asChild className="mt-4">
            <Link to="/connections">Connect Meta Ads</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">
              <Stat
                label="Spend"
                value={<CountUp value={totals!.spend} format={(n) => money(n, currency)} />}
                sub={`${money(data.dailyBudget, currency)} a day`}
              />
              <Stat
                label="Impressions"
                value={
                  <CountUp value={totals!.impressions} format={(n) => compact(Math.round(n))} />
                }
                sub={`${compact(totals!.reach)} people reached`}
              />
              <Stat
                label="Clicks"
                value={<CountUp value={totals!.clicks} format={(n) => compact(Math.round(n))} />}
                sub={`${totals!.ctr.toFixed(2)}% CTR · ${money(totals!.cpc, currency)} CPC`}
              />
              <Stat
                label="Results"
                value={<CountUp value={totals!.results} format={(n) => compact(Math.round(n))} />}
                sub={`${money(totals!.costPerResult, currency)} each`}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <div role="tablist" aria-label="Chart" className="flex gap-1">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      role="tab"
                      aria-selected={metric === m.key}
                      onClick={() => setMetric(m.key)}
                      className={
                        metric === m.key
                          ? "h-7 cursor-pointer rounded-md bg-accent px-2.5 text-sm font-medium text-foreground"
                          : "h-7 cursor-pointer rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground"
                      }
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Last 30 days</span>
              </div>
              <div className="h-72 px-2 pt-2 pb-4">
                {points.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No history yet.
                  </p>
                ) : (
                  <Suspense fallback={<Skeleton className="h-full rounded-lg" />}>
                    <TrendChart
                      points={points}
                      metric={metric}
                      label={METRICS.find((m) => m.key === metric)!.label}
                      format={(v) => (metric === "spend" ? money(v, currency) : compact(v))}
                    />
                  </Suspense>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <Link
                to="/approvals"
                className="panel flex items-center justify-between px-5 py-4 transition-colors hover:bg-accent/40"
              >
                <span>
                  <span className="block text-[13px] text-muted-foreground">Waiting for you</span>
                  <span className="mt-1 block text-[22px] leading-7 font-semibold tabular-nums">
                    {waiting.data ?? 0}
                  </span>
                </span>
                <span className="text-sm text-primary">Review</span>
              </Link>
              <div className="panel px-5 py-4">
                <p className="text-[13px] text-muted-foreground">Daily budget</p>
                <p className="mt-1 text-[22px] leading-7 font-semibold tabular-nums">
                  {money(data.dailyBudget, currency)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data.campaigns.filter((c) => c.running > 0).length} campaigns running
                </p>
              </div>
              <div className="panel space-y-2 px-5 py-4">
                <p className="text-sm font-medium">Quick actions</p>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/setup">Connect your AI</Link>
                </Button>
              </div>
            </div>
          </div>

          <AskAiPrompts />
        </>
      )}
    </AppShell>
  );
}
