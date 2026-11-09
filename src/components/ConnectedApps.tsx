import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listConnectedApps, revokeConnectedApp } from "@/lib/oauth.functions";

/** AI apps (Claude, ChatGPT, Cursor…) that signed in through OAuth, with a way to cut them off. */
export function ConnectedApps() {
  const queryClient = useQueryClient();
  const fetchApps = useServerFn(listConnectedApps);
  const revoke = useServerFn(revokeConnectedApp);
  const apps = useQuery({
    queryKey: ["connected-apps"],
    queryFn: () => fetchApps({}),
    retry: false,
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: (_result, id) => {
      toast.success("App disconnected.");
      // Drop the row now; a refetch can come back from a cached GET.
      queryClient.setQueryData(["connected-apps"], (rows: typeof apps.data) =>
        rows?.filter((a) => a.id !== id),
      );
      queryClient.invalidateQueries({ queryKey: ["connected-apps"] });
    },
    onError: () => toast.error("Could not disconnect the app."),
  });

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Connected AI apps</h2>
      {(apps.data ?? []).map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3"
        >
          <div>
            <p className="text-sm text-foreground">{a.client_name ?? "AI app"}</p>
            <p className="text-xs text-muted-foreground">
              {a.scopes.includes("mcp:write") ? "Read and make changes" : "Read only"} · connected{" "}
              {new Date(a.created_at).toLocaleDateString()}
              {a.last_used_at ? ` · last used ${new Date(a.last_used_at).toLocaleString()}` : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto gap-1.5 text-destructive hover:text-destructive"
            disabled={revokeMutation.isPending}
            onClick={() => revokeMutation.mutate(a.id)}
          >
            <Trash2 className="size-3.5" /> Disconnect
          </Button>
        </div>
      ))}
      {!apps.isLoading && !(apps.data ?? []).length ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No AI apps connected yet.
        </p>
      ) : null}
    </section>
  );
}
