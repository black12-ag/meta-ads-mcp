import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AdTimelineChart } from "@/components/meta/AdTimelineChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bulkMetaStatus,
  listMetaAds,
  listMetaChanges,
  syncMetaNow,
  updateMetaDestination,
} from "@/lib/meta-ads.functions";
import { classifyDestination, money } from "@/lib/meta/constants";

export const Route = createFileRoute("/_authenticated/meta")({
  head: () => ({
    meta: [
      { title: "Meta Ads dashboard — Viral4All Ads" },
      {
        name: "description",
        content:
          "Every running Meta ad with impressions, interactions, spend, budget, live status and last sync time — pause or resume in bulk.",
      },
      { property: "og:title", content: "Meta Ads dashboard — Viral4All Ads" },
      {
        property: "og:description",
        content:
          "Impressions, interactions, spend and budget for every Meta ad, with one-click pause and resume.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MetaDashboard,
});

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "last_7d", label: "7 days" },
  { value: "last_30d", label: "30 days" },
  { value: "last_90d", label: "90 days" },
  { value: "maximum", label: "All time" },
];

const num = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n ?? 0));

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MetaDashboard() {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState("last_30d");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState<Record<string, string>>({});

  const fetchAds = useServerFn(listMetaAds);
  const fetchChanges = useServerFn(listMetaChanges);
  const runSync = useServerFn(syncMetaNow);
  const setStatus = useServerFn(bulkMetaStatus);
  const setDestination = useServerFn(updateMetaDestination);

  const adsQuery = useQuery({
    queryKey: ["meta-ads", preset],
    queryFn: () => fetchAds({ data: { datePreset: preset } }),
    retry: false,
  });

  const changesQuery = useQuery({
    queryKey: ["meta-changes"],
    queryFn: () => fetchChanges({ data: { limit: 12 } }),
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: () => runSync({}),
    onSuccess: (result) => {
      if (result.status === "error") {
        toast.error(
          result.errorKind === "permission"
            ? "Meta refused the request. Reconnect Meta and allow ad management."
            : result.errorKind === "token"
              ? "Your Meta token expired. Reconnect on the Connections page."
              : (result.error ?? "Sync failed."),
        );
      } else {
        toast.success(
          `Synced ${result.adsSynced} ads${result.changes ? ` · ${result.changes} changes` : ""}`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
      queryClient.invalidateQueries({ queryKey: ["meta-changes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { ids: string[]; status: "ACTIVE" | "PAUSED" }) => setStatus({ data: vars }),
    onSuccess: (result) => {
      if (result.failed)
        toast.error(
          `${result.failed} ad(s) failed. ${result.results.find((r) => !r.ok)?.error ?? ""}`,
        );
      else toast.success(result.status === "ACTIVE" ? "Ads resumed" : "Ads paused");
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkMutation = useMutation({
    mutationFn: (vars: { adId: string; value: string }) =>
      setDestination({
        data: {
          adId: vars.adId,
          ...(({ destination, value }) => ({ destination, destinationValue: value }))(
            classifyDestination(vars.value),
          ),
        },
      }),
    onSuccess: () => {
      toast.success("Destination updated on Meta");
      queryClient.invalidateQueries({ queryKey: ["meta-ads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ads = adsQuery.data?.ads ?? [];
  const currency = adsQuery.data?.currency ?? "USD";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ads;
    return ads.filter(
      (a) =>
        a.adName.toLowerCase().includes(q) ||
        a.campaignName.toLowerCase().includes(q) ||
        (a.linkUrl ?? "").toLowerCase().includes(q),
    );
  }, [ads, search]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, a) => ({
          spend: acc.spend + a.insights.spend,
          impressions: acc.impressions + a.insights.impressions,
          results: acc.results + a.insights.results,
          budget: acc.budget + (a.dailyBudget ?? 0),
          live: acc.live + (a.running ? 1 : 0),
        }),
        { spend: 0, impressions: 0, results: 0, budget: 0, live: 0 },
      ),
    [filtered],
  );

  const notConnected = adsQuery.data?.connected === false;
  const errorMessage =
    adsQuery.error instanceof Error
      ? adsQuery.error.message
      : notConnected
        ? "No Meta account connected yet. Connect Meta Ads on the Connections page to see your ads here."
        : null;

  const busy = statusMutation.isPending;

  return (
    <AppShell
      title="Per-ad metrics"
      actions={
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="gap-2 transition-transform hover:-translate-y-0.5"
        >
          {syncMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sync now
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-border bg-background/40 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  preset === p.value
                    ? "bg-nav-button text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ads, campaigns or links"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Last sync {timeAgo(adsQuery.data?.lastSyncedAt ?? null)}
          </p>
        </div>

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 size-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">We couldn't load your Meta ads</p>
              <p className="text-muted-foreground">{errorMessage}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                If this mentions permissions or an expired session, reconnect Meta on the
                Connections page with ads_management access.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Live ads" value={`${totals.live} / ${filtered.length}`} />
          <Stat label="Spend" value={money(totals.spend, currency)} />
          <Stat label="Daily budget" value={money(totals.budget, currency)} />
          <Stat label="Impressions" value={num(totals.impressions)} />
          <Stat label="Results" value={num(totals.results)} />
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
            <p className="text-sm text-foreground">{selected.length} selected</p>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => statusMutation.mutate({ ids: selected, status: "PAUSED" })}
              className="gap-1.5"
            >
              <Pause className="size-3.5" /> Pause all
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => statusMutation.mutate({ ids: selected, status: "ACTIVE" })}
              className="gap-1.5"
            >
              <Play className="size-3.5" /> Resume all
            </Button>
            <button
              onClick={() => setSelected([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : null}

        {adsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading ads from Meta…
          </div>
        ) : null}

        <div className="space-y-4">
          {filtered.map((ad) => {
            const e = ad.insights.engagement;
            const interactions =
              e.postEngagement || e.reactions + e.comments + e.shares + e.linkClicks;
            const checked = selected.includes(ad.adId);
            return (
              <article
                key={ad.adId}
                className="panel p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(ev) =>
                        setSelected((prev) =>
                          ev.target.checked
                            ? [...prev, ad.adId]
                            : prev.filter((i) => i !== ad.adId),
                        )
                      }
                      className="mt-1 size-4 accent-[hsl(var(--primary))]"
                      aria-label={`Select ${ad.adName}`}
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{ad.adName}</h3>
                      <p className="text-xs text-muted-foreground">
                        {ad.campaignName} · {ad.adsetName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium ${
                        ad.running ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {ad.running ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <Pause className="size-3" />
                      )}
                      {ad.effectiveStatus
                        .replace(/_/g, " ")
                        .toLowerCase()
                        .replace(/^./, (ch) => ch.toUpperCase())}
                    </span>
                    <Button
                      size="sm"
                      variant={ad.running ? "outline" : "default"}
                      disabled={busy}
                      onClick={() =>
                        statusMutation.mutate({
                          ids: [ad.adId],
                          status: ad.running ? "PAUSED" : "ACTIVE",
                        })
                      }
                      className="gap-1.5"
                    >
                      {ad.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      {ad.running ? "Pause" : "Resume"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                  <Stat label="Spend" value={money(ad.insights.spend, currency)} />
                  <Stat
                    label="Budget"
                    value={money(ad.dailyBudget ?? ad.lifetimeBudget ?? 0, currency)}
                    hint={ad.dailyBudget ? "daily" : ad.lifetimeBudget ? "lifetime" : undefined}
                  />
                  <Stat
                    label="Impressions"
                    value={num(ad.insights.impressions)}
                    hint={`${num(ad.insights.reach)} reached`}
                  />
                  <Stat
                    label="Interactions"
                    value={num(interactions)}
                    hint={`${num(e.reactions)} reactions · ${num(e.comments)} comments`}
                  />
                  <Stat
                    label="Clicks"
                    value={num(ad.insights.clicks)}
                    hint={`CTR ${ad.insights.ctr.toFixed(2)}%`}
                  />
                  <Stat
                    label="Results"
                    value={num(ad.insights.results)}
                    hint={`${money(ad.insights.costPerResult, currency)} each`}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label className="text-[13px] text-foreground">Destination</label>
                  <Input
                    value={linkDraft[ad.adId] ?? ad.linkUrl ?? ""}
                    onChange={(ev) =>
                      setLinkDraft((prev) => ({ ...prev, [ad.adId]: ev.target.value }))
                    }
                    placeholder="https://your-page.com or WhatsApp number"
                    className="max-w-md flex-1 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      linkMutation.isPending ||
                      !(linkDraft[ad.adId] ?? "").trim() ||
                      (linkDraft[ad.adId] ?? "") === (ad.linkUrl ?? "")
                    }
                    onClick={() =>
                      linkMutation.mutate({ adId: ad.adId, value: linkDraft[ad.adId] ?? "" })
                    }
                  >
                    Save link
                  </Button>
                  {ad.linkUrl ? (
                    <a
                      href={ad.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      Open <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>

                <AdTimelineChart adId={ad.adId} />
              </article>
            );
          })}

          {!adsQuery.isLoading && !filtered.length && !errorMessage ? (
            <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No ads found for this period. Create one from the Ads control room.
            </p>
          ) : null}
        </div>

        <section className="panel p-4">
          <h2 className="text-sm font-semibold text-foreground">Recent changes</h2>
          <p className="text-xs text-muted-foreground">Changes found on each sync.</p>
          <ul className="mt-3 space-y-2">
            {(changesQuery.data ?? []).map((c: any) => (
              <li key={c.id} className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="text-foreground">{c.ad_name ?? c.external_ad_id}</span>
                <span className="rounded bg-nav-button px-1.5 py-0.5">{c.field}</span>
                {/^https?:\/\//.test(c.new_value ?? "") ? (
                  <span>updated</span>
                ) : (
                  <span className="min-w-0 break-all">
                    {c.previous_value ?? "—"} →{" "}
                    <span className="text-foreground">{c.new_value ?? "—"}</span>
                  </span>
                )}
                <span className="ml-auto">
                  {timeAgo(c.created_at)} · {c.source}
                </span>
              </li>
            ))}
            {!(changesQuery.data ?? []).length ? (
              <li className="text-xs text-muted-foreground">Nothing has changed yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
