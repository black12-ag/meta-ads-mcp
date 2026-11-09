import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Plus,
  Settings2,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { AdEditorDialog } from "@/components/meta/AdEditorDialog";
import { CreateCampaignDialog } from "@/components/meta/CreateCampaignDialog";
import { BudgetEditor } from "@/components/meta/BudgetEditor";
import { SyncStatusBar } from "@/components/meta/SyncStatusBar";

import { getMetaOverview, listMetaCampaigns, updateMetaStatus } from "@/lib/meta.functions";
import { isRunning, money } from "@/lib/meta/constants";
import type { MetaAd, MetaCampaign } from "@/lib/meta/ads.server";

export const Route = createFileRoute("/_authenticated/ads")({
  head: () => ({
    meta: [
      { title: "Ads control room — Viral4All Ads" },
      {
        name: "description",
        content:
          "See every Meta ad you're running, adjust budgets and destinations, and pause or resume in one click.",
      },
      { property: "og:title", content: "Ads control room — Viral4All Ads" },
      {
        property: "og:description",
        content: "Live Meta ad control: budgets, destinations, play and pause.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdsPage,
});

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "maximum", label: "All time" },
];

function StatusPill({ status, own }: { status: string; own?: string }) {
  const live = isRunning(status);
  // When an object is set ACTIVE but a parent is paused, Meta reports CAMPAIGN_PAUSED or
  // ADSET_PAUSED. Show both so the pill and the button never look like they disagree.
  const parentPaused = own !== undefined && own !== status && isRunning(own);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium ${
          live ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
        }`}
      >
        {status
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/^./, (ch) => ch.toUpperCase())}
      </span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[84px]">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AdsPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getMetaOverview);
  const campaignsFn = useServerFn(listMetaCampaigns);
  const statusFn = useServerFn(updateMetaStatus);

  const [datePreset, setDatePreset] = useState("last_30d");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ ad: MetaAd; adsetId: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: overview } = useQuery({
    queryKey: ["meta-overview"],
    queryFn: () => overviewFn({}),
  });
  const connected = overview?.connected;
  const accountId = overview?.connected ? overview.activeAdAccountId : null;
  const pageId = overview?.connected ? overview.activePageId : null;
  const currency =
    (overview?.connected && overview.accounts.find((a) => a.account_id === accountId)?.currency) ||
    "USD";

  const campaignsQuery = useQuery({
    queryKey: ["meta-campaigns", accountId, datePreset],
    enabled: Boolean(accountId),
    queryFn: () => campaignsFn({ data: { accountId: accountId!, datePreset } }),
  });

  const toggle = useMutation({
    mutationFn: (input: { objectId: string; status: "ACTIVE" | "PAUSED" }) =>
      statusFn({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.status === "ACTIVE" ? "Running" : "Paused");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const campaigns: MetaCampaign[] = campaignsQuery.data?.campaigns ?? [];

  return (
    <AppShell
      title="Ads"
      actions={
        <div className="flex gap-2">
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
            onClick={() => {
              if (!accountId) return toast.error("Choose an ad account on Connections first.");
              if (!pageId) return toast.error("Choose a Facebook page on Connections first.");
              setCreating(true);
            }}
          >
            <Plus className="size-4" />
            New campaign
          </Button>
        </div>
      }
    >
      {connected ? <SyncStatusBar /> : null}
      {!connected ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Connect Meta Ads on the Connections page to see your live campaigns here.
          </p>
        </div>
      ) : !accountId ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Choose an ad account on the Connections page first.
        </div>
      ) : campaignsQuery.isLoading ? (
        <div className="panel flex items-center gap-3 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading campaigns from Meta…
        </div>
      ) : campaignsQuery.isError ? (
        <div className="panel p-6 text-sm text-destructive">
          {(campaignsQuery.error as Error).message}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          <p>
            No campaigns found on <span className="font-mono">act_{accountId}</span> for this
            window.
          </p>
          <Button
            onClick={() => {
              if (!pageId) return toast.error("Choose a Facebook page on Connections first.");
              setCreating(true);
            }}
            className="mt-4"
          >
            <Plus className="size-4" /> Build your first campaign
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const expanded = open[campaign.id] ?? true;
            return (
              <section key={campaign.id} className="panel panel-lift overflow-hidden">
                <header className="flex flex-wrap items-center gap-4 p-5">
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [campaign.id]: !expanded }))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-display text-base font-semibold">
                        {campaign.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {campaign.objective?.replace(/^OUTCOME_/, "").toLowerCase() ?? "campaign"} ·{" "}
                        {campaign.adsets.length} ad set{campaign.adsets.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center gap-5">
                    <Metric label="Spend" value={money(campaign.insights.spend, currency)} />
                    <Metric label="Impr." value={campaign.insights.impressions.toLocaleString()} />
                    <Metric label="Clicks" value={campaign.insights.clicks.toLocaleString()} />
                    <Metric label="CTR" value={`${campaign.insights.ctr.toFixed(2)}%`} />
                    <StatusPill status={campaign.effectiveStatus} own={campaign.status} />
                    <Button
                      variant="outline"
                      onClick={() =>
                        toggle.mutate({
                          objectId: campaign.id,
                          status: isRunning(campaign.status) ? "PAUSED" : "ACTIVE",
                        })
                      }
                      title={
                        isRunning(campaign.status)
                          ? "Set this to paused on Meta"
                          : "Set this to active on Meta"
                      }
                    >
                      {isRunning(campaign.status) ? (
                        <>
                          <Pause className="size-3.5" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" /> Run
                        </>
                      )}
                    </Button>
                  </div>
                </header>

                {expanded ? (
                  <div className="border-t border-border">
                    {campaign.adsets.map((adset) => (
                      <div key={adset.id} className="border-b border-border/60 last:border-0">
                        <div className="flex flex-wrap items-center gap-4 bg-surface-2/40 px-5 py-3">
                          <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                            <p className="truncate text-sm font-medium">{adset.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {adset.optimizationGoal?.replace(/_/g, " ").toLowerCase() ?? "ad set"}
                              {adset.startTime
                                ? ` · from ${new Date(adset.startTime).toLocaleDateString()}`
                                : ""}
                              {adset.endTime
                                ? ` to ${new Date(adset.endTime).toLocaleDateString()}`
                                : " · no end date"}
                            </p>
                          </div>
                          <BudgetEditor
                            objectId={adset.id}
                            currency={currency}
                            dailyBudget={adset.dailyBudget}
                            lifetimeBudget={adset.lifetimeBudget}
                            adsetId={adset.id}
                            startTime={adset.startTime}
                            endTime={adset.endTime}
                          />
                          <StatusPill status={adset.effectiveStatus} own={adset.status} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              toggle.mutate({
                                objectId: adset.id,
                                status: isRunning(adset.status) ? "PAUSED" : "ACTIVE",
                              })
                            }
                          >
                            {isRunning(adset.status) ? (
                              <>
                                <Pause className="size-3.5" /> Pause
                              </>
                            ) : (
                              <>
                                <Play className="size-3.5" /> Run
                              </>
                            )}
                          </Button>
                        </div>

                        <ul>
                          {adset.ads.map((ad) => (
                            <li
                              key={ad.id}
                              className="flex flex-wrap items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2/30"
                            >
                              {/* Meta's image links expire; a broken one hides and leaves the icon. */}
                              <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-accent/50">
                                <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                                {ad.imageUrl ? (
                                  <img
                                    src={ad.imageUrl}
                                    alt={`Creative for ${ad.name}`}
                                    className="absolute inset-0 size-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
                                <p className="truncate text-sm">{ad.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {ad.callToAction?.replace(/_/g, " ").toLowerCase() ?? "no cta"}
                                  {ad.linkUrl ? ` → ${ad.linkUrl}` : ""}
                                </p>
                              </div>
                              <Metric label="Spend" value={money(ad.insights.spend, currency)} />
                              <Metric label="Clicks" value={ad.insights.clicks.toLocaleString()} />
                              <Metric
                                label="Results"
                                value={ad.insights.results.toLocaleString()}
                              />
                              <StatusPill status={ad.effectiveStatus} own={ad.status} />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditing({ ad, adsetId: adset.id })}
                              >
                                <Settings2 className="size-3.5" /> Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toggle.mutate({
                                    objectId: ad.id,
                                    status: isRunning(ad.status) ? "PAUSED" : "ACTIVE",
                                  })
                                }
                              >
                                {isRunning(ad.status) ? (
                                  <>
                                    <Pause className="size-3.5" /> Pause
                                  </>
                                ) : (
                                  <>
                                    <Play className="size-3.5" /> Run
                                  </>
                                )}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {editing && accountId ? (
        <AdEditorDialog
          ad={editing.ad}
          accountId={accountId}
          pageId={pageId ?? ""}
          onClose={() => setEditing(null)}
        />
      ) : null}

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
