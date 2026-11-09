import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RotateCcw, Search, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSavedAds, relaunchSavedAd } from "@/lib/meta.functions";
import { money } from "@/lib/meta/constants";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Ad library — Viral4All Ads" },
      {
        name: "description",
        content:
          "Every ad you've ever run, saved with its creative, budget and results — ready to relaunch.",
      },
      { property: "og:title", content: "Ad library — Viral4All Ads" },
      {
        property: "og:description",
        content: "Saved ads with lifetime results, ready to run again.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedAds);
  const relaunchFn = useServerFn(relaunchSavedAd);
  const [q, setQ] = useState("");

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["saved-ads"], queryFn: () => listFn({}) });

  const relaunch = useMutation({
    mutationFn: (savedAdId: string) => relaunchFn({ data: { savedAdId } }),
    onSuccess: () => {
      toast.success("Copied on Meta as a paused campaign.");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = q.trim().toLowerCase();
  const ads = term
    ? data.filter((a) =>
        [a.name, a.campaign_name, a.headline, a.destination_url]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : data;

  return (
    <AppShell
      title="Library"
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved ads"
            aria-label="Search saved ads"
            className="w-56 pl-8"
          />
        </div>
      }
    >
      {isLoading ? (
        <div className="panel flex items-center gap-3 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your saved ads…
        </div>
      ) : error ? (
        <div className="panel p-8 text-center text-sm text-destructive">
          Couldn't load your saved ads. {(error as Error).message}
        </div>
      ) : ads.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Nothing here yet. Open the Ads page once to fill it.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ads.map((ad) => (
            <article key={ad.id} className="panel panel-lift flex flex-col p-5">
              <div className="flex gap-3">
                {/* Meta's image links expire; a broken one hides and leaves the icon. */}
                <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-accent/50">
                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                  {ad.image_url ? (
                    <img
                      src={ad.image_url}
                      alt={`Creative for ${ad.name}`}
                      className="absolute inset-0 size-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-sm font-semibold">{ad.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">{ad.campaign_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground font-medium">
                    {ad.destination_type} · {ad.call_to_action.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Spend", money(Number(ad.lifetime_spend_cents), ad.currency)],
                  ["Clicks", Number(ad.lifetime_clicks).toLocaleString()],
                  ["Results", Number(ad.lifetime_results).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-border bg-surface-2 py-2">
                    <dt className="text-xs text-muted-foreground font-medium">{label}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

              <Button
                variant="outline"
                onClick={() => relaunch.mutate(ad.id)}
                disabled={relaunch.isPending}
                className="mt-4"
              >
                <RotateCcw className="size-4" /> Run again
              </Button>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
