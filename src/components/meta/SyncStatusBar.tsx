import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMetaSyncRuns, runMetaSyncNow } from "@/lib/meta.functions";

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function SyncStatusBar() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMetaSyncRuns);
  const syncFn = useServerFn(runMetaSyncNow);

  const runs = useQuery({
    queryKey: ["meta-sync-runs"],
    queryFn: () => listFn({}),
    refetchInterval: 5 * 60_000,
  });

  const sync = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (r) => {
      if (r.status === "error") toast.error(r.error ?? "Sync failed.");
      else if (r.status === "skipped") toast.info("Pick an ad account first.");
      else toast.success(`Synced ${r.adsSynced} ad${r.adsSynced === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey: ["meta-sync-runs"] });
      qc.invalidateQueries({ queryKey: ["saved-ads"] });
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const last = runs.data?.[0];
  const failed = last?.status === "error";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      {failed ? (
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
      )}
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {last ? (
          failed ? (
            <>
              Last sync failed {relative(last.created_at)}: {last.error_message}
            </>
          ) : (
            <>
              Insights synced {relative(last.created_at)} · {last.ads_synced} ads mirrored ·
              auto-refreshes on schedule
            </>
          )
        ) : (
          <>Refreshes when you open this page.</>
        )}
      </p>
      <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
        {sync.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RotateCw className="size-3.5" />
        )}
        Sync now
      </Button>
    </div>
  );
}
