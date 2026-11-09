import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Pause, Play, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/meta/CreateCampaignDialog";
import { getMetaOverview, listMetaCampaigns, updateMetaStatus } from "@/lib/meta.functions";
import { isRunning, money } from "@/lib/meta/constants";
import type { MetaCampaign } from "@/lib/meta/ads.server";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Viral4All Ads" },
      {
        name: "description",
        content: "Launch, pause and resume real Meta ad campaigns on your connected ad account.",
      },
      { property: "og:title", content: "Campaigns — Viral4All Ads" },
      { property: "og:description", content: "Live Meta campaign control: launch, pause, resume." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Campaigns,
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

function Campaigns() {
  const qc = useQueryClient();
  const [datePreset, setDatePreset] = useState("last_30d");
  const [creating, setCreating] = useState(false);

  const overviewFn = useServerFn(getMetaOverview);
  const campaignsFn = useServerFn(listMetaCampaigns);
  const statusFn = useServerFn(updateMetaStatus);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["meta-overview"],
    queryFn: () => overviewFn({}),
  });
  const accountId = overview?.connected ? overview.activeAdAccountId : null;
  const pageId = overview?.connected ? overview.activePageId : null;
  const currency =
    (overview?.connected && overview.accounts.find((a) => a.account_id === accountId)?.currency) ||
    "USD";

  const campaignsQuery = useQuery({
    queryKey: ["meta-campaigns", accountId, datePreset],
    enabled: Boolean(accountId),
    queryFn: () => campaignsFn({ data: { accountId: accountId!, datePreset } }),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: (input: { objectId: string; status: "ACTIVE" | "PAUSED" }) =>
      statusFn({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.status === "ACTIVE" ? "Campaign running" : "Campaign paused");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["ads-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const campaigns: MetaCampaign[] = campaignsQuery.data?.campaigns ?? [];

  const rollup = (c: MetaCampaign) => {
    const ads = c.adsets.flatMap((s) => s.ads);
    return {
      ads: ads.length,
      running: ads.filter((a) => isRunning(a.status)).length,
      spend: ads.reduce((a, x) => a + x.insights.spend, 0),
      impressions: ads.reduce((a, x) => a + x.insights.impressions, 0),
      clicks: ads.reduce((a, x) => a + x.insights.clicks, 0),
      results: ads.reduce((a, x) => a + x.insights.results, 0),
      // Daily and lifetime budgets are different units of time; adding them is meaningless.
      dailyBudget: c.adsets.reduce((a, s) => a + (s.dailyBudget ?? 0), 0) || c.dailyBudget || 0,
      lifetimeBudget:
        c.adsets.reduce((a, s) => a + (s.lifetimeBudget ?? 0), 0) || c.lifetimeBudget || 0,
    };
  };

  return (
    <AppShell
      title="Campaigns"
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
            onClick={() => campaignsQuery.refetch()}
            disabled={campaignsQuery.isFetching}
          >
            <RefreshCw className={campaignsQuery.isFetching ? "animate-spin" : ""} />
          </Button>
          <Button
            onClick={() => setCreating(true)}
            disabled={!accountId || !pageId}
            title={!pageId ? "Select an active Facebook Page on Connections first" : undefined}
          >
            <Plus className="size-4" /> New campaign
          </Button>
        </div>
      }
    >
      {overviewLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : !accountId ? (
        <div className="panel p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Connect a Meta ad account to launch and manage campaigns.
          </p>
          <Button asChild className="mt-4">
            <Link to="/connections">Connect Meta Ads</Link>
          </Button>
        </div>
      ) : campaignsQuery.error ? (
        <p className="panel p-8 text-center text-sm text-destructive">
          {(campaignsQuery.error as Error).message}
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-left text-xs text-muted-foreground font-medium">
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Budget</th>
                <th className="px-5 py-3 text-right font-medium">Spend</th>
                <th className="px-5 py-3 text-right font-medium">Impressions</th>
                <th className="px-5 py-3 text-right font-medium">Clicks</th>
                <th className="px-5 py-3 text-right font-medium">Results</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaignsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center justify-center">
                      <div className="relative mb-5">
                        <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl" />
                        <img
                          src="/brand/mascot/mascot-promote.jpg"
                          alt="Launch campaign mascot"
                          className="relative size-32 rounded-3xl object-cover ring-2 ring-primary/40 shadow-xl transition-transform duration-300 hover:scale-105"
                        />
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
                        Ready for Takeoff
                      </span>
                      <h4 className="mt-3 text-lg font-bold tracking-tight text-foreground sm:text-xl">
                        No campaigns launched yet
                      </h4>
                      <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
                        Ready to reach thousands of targeted customers? Let our AI lion assistant generate and blast off your first campaign in minutes.
                      </p>
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <Button
                          onClick={() => setCreating(true)}
                          disabled={!accountId || !pageId}
                          className="shadow-sm"
                        >
                          <Plus className="mr-1.5 size-4" /> New Campaign
                        </Button>
                        <Button variant="outline" asChild>
                          <Link to="/promote">AI Promote Wizard</Link>
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => {
                  const r = rollup(c);
                  const live = isRunning(c.status);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-accent/50">
                      <td className="px-5 py-3.5">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.objective?.replace(/^OUTCOME_/, "").toLowerCase()} · {r.running}/
                          {r.ads} ads running
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium ${
                            live ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                          }`}
                        >
                          {c.status
                            .replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/^./, (ch) => ch.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {r.dailyBudget ? (
                          <span title="Daily budget">{money(r.dailyBudget, currency)}/day</span>
                        ) : null}
                        {r.dailyBudget && r.lifetimeBudget ? <br /> : null}
                        {r.lifetimeBudget ? (
                          <span title="Lifetime budget">
                            {money(r.lifetimeBudget, currency)} total
                          </span>
                        ) : null}
                        {!r.dailyBudget && !r.lifetimeBudget ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {money(r.spend, currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {compact(r.impressions)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{compact(r.clicks)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">{compact(r.results)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggle.mutate({ objectId: c.id, status: live ? "PAUSED" : "ACTIVE" })
                          }
                          disabled={toggle.isPending}
                        >
                          {live ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                          {live ? "Pause" : "Resume"}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && accountId && pageId ? (
        <CreateCampaignDialog
          accountId={accountId}
          pageId={pageId}
          currency={currency}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </AppShell>
  );
}
