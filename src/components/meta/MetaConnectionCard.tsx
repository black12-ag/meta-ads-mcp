import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Loader2, Plus, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectMeta,
  getMetaAuthUrl,
  getMetaOverview,
  setMetaActive,
  syncMetaAssets,
} from "@/lib/meta.functions";
import { ACCOUNT_STATUS, money } from "@/lib/meta/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MetaConnectionCard() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getMetaOverview);
  const authUrlFn = useServerFn(getMetaAuthUrl);
  const activeFn = useServerFn(setMetaActive);
  const syncFn = useServerFn(syncMetaAssets);
  const disconnectFn = useServerFn(disconnectMeta);

  const { data, isLoading } = useQuery({
    queryKey: ["meta-overview"],
    queryFn: () => overviewFn({}),
  });

  const connect = useMutation({
    mutationFn: async () => authUrlFn({ data: { origin: window.location.origin } }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const choose = useMutation({
    mutationFn: (input: { adAccountId?: string; pageId?: string }) => activeFn({ data: input }),
    onSuccess: () => {
      toast.success("Active selection updated");
      qc.invalidateQueries({ queryKey: ["meta-overview"] });
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (r) => {
      toast.success(`Synced ${r.accounts} ad accounts and ${r.pages} pages`);
      qc.invalidateQueries({ queryKey: ["meta-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: (connectionId?: string) =>
      disconnectFn({ data: connectionId ? { connectionId } : {} }),
    onSuccess: () => {
      toast.success("Meta login removed");
      qc.invalidateQueries({ queryKey: ["meta-overview"] });
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="panel mb-6 flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking your Meta connection…
      </div>
    );
  }

  if (!data?.connected) {
    return (
      <div className="panel panel-lift mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="font-display text-lg font-semibold">Meta Ads</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in with Facebook to bring in your ad accounts and pages.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {["ads_management", "ads_read", "pages_show_list", "business_management"].map((s) => (
                <li key={s} className="rounded-sm border border-border px-1.5 py-0.5 font-mono">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
            {connect.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Connect Meta Ads
          </Button>
        </div>
      </div>
    );
  }

  const activeAccount = data.accounts.find((a) => a.account_id === data.activeAdAccountId);

  return (
    <div className="panel panel-lift mb-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {data.profile.picture ? (
            <img
              src={data.profile.picture}
              alt={`${data.profile.name ?? "Meta user"} profile picture`}
              className="size-11 rounded-full border border-border object-cover"
            />
          ) : null}
          <div>
            <h2 className="font-display text-lg font-semibold">
              {data.profile.name ?? "Meta account"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Meta Ads connected
              {data.profile.expiresAt
                ? ` · token valid until ${new Date(data.profile.expiresAt).toLocaleDateString()}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button asChild>
            <Link to="/ads">
              Manage ads <ArrowUpRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => connect.mutate()} disabled={connect.isPending}>
            <Plus className="size-4" /> Add Meta login
          </Button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-background/40 p-4">
        <p className="text-xs text-muted-foreground font-medium">Linked Meta logins</p>
        <ul className="mt-2.5 divide-y divide-border">
          {data.connections.map((c) => {
            const owned = data.accounts.filter((a) => a.connection_id === c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                {c.meta_picture_url ? (
                  <img
                    src={c.meta_picture_url}
                    alt={`${c.meta_name ?? "Meta"} profile picture`}
                    className="size-7 rounded-full border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.meta_name ?? "Meta login"}
                    {c.is_primary ? <Badge className="ml-2">In focus</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {owned.length} ad account{owned.length === 1 ? "" : "s"}
                    {c.token_expires_at
                      ? ` · token valid until ${new Date(c.token_expires_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnect.mutate(c.id)}
                  disabled={disconnect.isPending}
                  className="text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                >
                  <Unplug className="size-3.5" /> Remove
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Ad account you're controlling
          </span>
          <select
            value={data.activeAdAccountId ?? ""}
            onChange={(e) => choose.mutate({ adAccountId: e.target.value })}
            className="mt-2 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/20"
          >
            <option value="" disabled>
              {data.accounts.length ? "Choose an ad account" : "No ad accounts found"}
            </option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.account_id}>
                {a.name} · act_{a.account_id} · {a.currency}
              </option>
            ))}
          </select>
          {activeAccount ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {ACCOUNT_STATUS[activeAccount.account_status ?? -1] ?? "Status unknown"}
              {activeAccount.amount_spent_cents
                ? ` · spent ${money(Number(activeAccount.amount_spent_cents), activeAccount.currency)}`
                : ""}
              {activeAccount.business_name ? ` · ${activeAccount.business_name}` : ""}
            </p>
          ) : null}
        </label>

        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Facebook page you're controlling
          </span>
          <select
            value={data.activePageId ?? ""}
            onChange={(e) => choose.mutate({ pageId: e.target.value })}
            className="mt-2 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/20"
          >
            <option value="" disabled>
              {data.pages.length ? "Choose a page" : "No pages found"}
            </option>
            {data.pages.map((p) => (
              <option key={p.id} value={p.page_id}>
                {p.name}
                {p.category ? ` · ${p.category}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            {data.pages.length} page{data.pages.length === 1 ? "" : "s"} available ·{" "}
            {data.accounts.length} ad account{data.accounts.length === 1 ? "" : "s"}
          </p>
        </label>
      </div>
    </div>
  );
}
