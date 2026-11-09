import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  History,
  Loader2,
  LogOut,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getAdsOverview, disconnectMeta } from "@/lib/overview.functions";
import { getMetaAuthUrl, listMetaAccounts, setMetaActive } from "@/lib/meta.functions";
import { listConnectionAudit } from "@/lib/audit.functions";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

const HISTORY_LABELS: Record<string, string> = {
  "connection.connect": "Connected Meta account",
  "connection.disconnect": "Disconnected Meta account",
  "connection.sync": "Synced pages & ad accounts",
  "account.switch": "Switched ad account",
};

/** Turn any thrown value into a message plus a concrete next step. */
function explainError(error: unknown): { message: string; hint: string } {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  const text = raw.toLowerCase();

  if (text.includes("401") || text.includes("unauthorized") || text.includes("session"))
    return { message: raw, hint: "Your session expired. Sign in again, then retry." };
  if (text.includes("token") && (text.includes("expired") || text.includes("invalid")))
    return {
      message: raw,
      hint: "The Meta access token is no longer valid. Reconnect the account.",
    };
  if (text.includes("permission") || text.includes("scope") || text.includes("(#200)"))
    return {
      message: raw,
      hint: "Meta withheld a permission. Re-approve ads_management and pages_show_list while reconnecting.",
    };
  if (text.includes("app_id") || text.includes("redirect") || text.includes("uri"))
    return {
      message: raw,
      hint: "The redirect URL does not match your Meta app. Fix it in Settings, then retry.",
    };
  if (text.includes("rate") || text.includes("too many"))
    return { message: raw, hint: "Meta is rate-limiting requests. Wait a minute and try again." };
  if (text.includes("fetch") || text.includes("network") || text.includes("timeout"))
    return {
      message: raw,
      hint: "The request could not reach Meta. Check your connection and retry.",
    };
  if (text.includes("not connected"))
    return { message: raw, hint: "Connect a Meta account first, then pick an ad account here." };
  return { message: raw, hint: "Open the audit log for the full record of this attempt." };
}

function failToast(title: string, error: unknown) {
  const { message, hint } = explainError(error);
  toast.error(title, { description: `${message} ${hint}`, duration: 9000 });
}

export function MetaConnectionBanner({
  quiet = false,
  className,
}: {
  /** render nothing while Meta is connected and healthy */
  quiet?: boolean;
  className?: string;
}) {
  const overviewFn = useServerFn(getAdsOverview);
  const disconnectFn = useServerFn(disconnectMeta);
  const authUrlFn = useServerFn(getMetaAuthUrl);
  const accountsFn = useServerFn(listMetaAccounts);
  const setActiveFn = useServerFn(setMetaActive);
  const historyFn = useServerFn(listConnectionAudit);
  const queryClient = useQueryClient();

  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const status = useQuery({
    queryKey: ["ads-overview-status"],
    queryFn: () => overviewFn({ data: { datePreset: "today" } }),
    staleTime: 15_000,
    refetchInterval: (q) => (q.state.data?.connected ? 60_000 : 10_000),
    refetchOnWindowFocus: true,
    retry: false,
  });

  const overview = status.data;
  const isConnected = overview?.connected === true;
  const connectedAccountId = overview?.connected ? overview.accountId : null;

  const accounts = useQuery({
    queryKey: ["meta-accounts-banner"],
    queryFn: () => accountsFn(),
    enabled: isConnected,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const history = useQuery({
    queryKey: ["meta-connection-history"],
    queryFn: () => historyFn({ data: { limit: 15 } }),
    enabled: showHistory,
    refetchInterval: showHistory ? 30_000 : false,
    retry: false,
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ads-overview-status"] }),
      queryClient.invalidateQueries({ queryKey: ["meta-accounts-banner"] }),
      queryClient.invalidateQueries({ queryKey: ["meta-connection-history"] }),
    ]);
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Meta account? This clears all synced data.")) return;
    setIsDisconnecting(true);
    try {
      await disconnectFn();
      await refreshAll();
      toast.success("Meta account disconnected", {
        description: "Pick a different account below or reconnect at any time.",
      });
    } catch (error) {
      failToast("Could not disconnect the Meta account", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      const { url } = await authUrlFn({ data: { origin: window.location.origin } });
      if (!url) throw new Error("Meta did not return a sign-in link.");
      window.location.href = url;
    } catch (error) {
      failToast("Could not start the Meta sign-in", error);
      setIsReconnecting(false);
    }
  };

  const handleSwitch = async (accountId: string, name: string) => {
    setSwitchingTo(accountId);
    try {
      await setActiveFn({ data: { adAccountId: accountId } });
      await refreshAll();
      toast.success(`Now managing ${name}`, { description: `Account ${accountId} is active.` });
    } catch (error) {
      failToast("Could not switch ad account", error);
    } finally {
      setSwitchingTo(null);
    }
  };

  if (status.isLoading) return null;
  if (quiet && overview?.connected === true) return null;

  const accountList = accounts.data?.connected ? accounts.data.accounts : [];
  const activeId = accounts.data?.connected ? accounts.data.activeAdAccountId : null;
  const isSyncing = status.isFetching || accounts.isFetching;

  return (
    <div
      className={cn(
        className,
        "relative overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300",
        isConnected
          ? "border-success/20 bg-success/5 text-success"
          : "border-warning/20 bg-warning/5 text-warning",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              isConnected ? "bg-success/20" : "bg-warning/20",
            )}
          >
            {isSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isConnected ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold leading-tight">
              {isConnected ? "Meta Ads Connected" : "Meta Ads Not Connected"}
              {isSyncing ? (
                <span className="ml-2 text-xs font-normal opacity-70">syncing…</span>
              ) : null}
            </h4>
            <p className="mt-0.5 text-xs opacity-80">
              {isConnected
                ? `Active account: ${connectedAccountId ?? activeId ?? "—"}. Live sync is operational.`
                : "Connect your Meta account to start managing ads and viewing live metrics."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void refreshAll()}
            disabled={isSyncing}
            className="flex items-center gap-1.5 h-7 rounded-md border border-current/20 px-2.5 text-xs font-semibold transition-all hover:bg-current/10 disabled:opacity-50"
            title="Refresh connection status"
            aria-label="Refresh connection status"
          >
            <RefreshCw className={cn("size-3", isSyncing && "animate-spin")} />
          </button>

          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 h-7 rounded-md border border-current/20 px-2.5 text-xs font-semibold transition-all hover:bg-current/10"
          >
            <History className="size-3" />
            History
            <ChevronDown
              className={cn("size-3 transition-transform", showHistory && "rotate-180")}
            />
          </button>

          {isConnected ? (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex items-center gap-1.5 h-7 rounded-md border border-danger/20 bg-danger/10 px-2.5 text-xs font-semibold text-danger transition-all hover:bg-danger/20 disabled:opacity-50"
            >
              {isDisconnecting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <LogOut className="size-3" />
              )}
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="flex items-center gap-1.5 h-7 whitespace-nowrap rounded-md bg-warning px-2.5 text-xs font-semibold text-warning-foreground transition-all hover:translate-x-0.5 disabled:opacity-50"
            >
              {isReconnecting ? <Loader2 className="size-3 animate-spin" /> : null}
              Connect Now
              <ArrowRight className="size-3" />
            </button>
          )}

          <Link
            to={isConnected ? "/settings" : "/connections"}
            className={cn(
              "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-all hover:translate-x-0.5",
              isConnected ? "bg-success text-success-foreground" : "border border-current/20",
            )}
          >
            {isConnected ? "Manage" : "All connections"}
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {accountList.length > 0 && (
        <div className="relative mt-3 border-t border-current/10 pt-3">
          <p className="mb-2 text-xs font-bold opacity-70">Switch ad account</p>
          <div className="flex flex-wrap gap-2">
            {accountList.map((a) => {
              const active = a.account_id === activeId;
              return (
                <button
                  key={a.account_id}
                  onClick={() => void handleSwitch(a.account_id, a.name)}
                  disabled={active || switchingTo !== null}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-all disabled:opacity-60",
                    active
                      ? "border-current/40 bg-current/10 font-semibold"
                      : "border-current/15 hover:bg-current/10",
                  )}
                >
                  {switchingTo === a.account_id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  <span className="max-w-[14rem] truncate">{a.name}</span>
                  <span className="font-mono text-[10px] opacity-60">{a.account_id}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showHistory && (
        <div className="relative mt-3 border-t border-current/10 pt-3">
          <p className="mb-2 text-xs font-bold opacity-70">Connection history</p>
          {history.isLoading ? (
            <p className="flex items-center gap-2 text-xs opacity-70">
              <Loader2 className="size-3 animate-spin" /> Loading history…
            </p>
          ) : history.isError ? (
            <p className="text-xs opacity-80">{(history.error as Error).message}</p>
          ) : (history.data?.length ?? 0) === 0 ? (
            <p className="text-xs opacity-70">No changes yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.data!.map((row) => (
                <li key={row.id} className="flex items-start gap-2 text-xs">
                  {row.ok ? (
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 opacity-80" />
                  ) : (
                    <XCircle className="mt-0.5 size-3 shrink-0 text-danger" />
                  )}
                  <span className="font-medium">{HISTORY_LABELS[row.action] ?? row.action}</span>
                  {row.ad_account_id ? (
                    <span className="font-mono text-[10px] opacity-60">{row.ad_account_id}</span>
                  ) : null}
                  <span className="ml-auto whitespace-nowrap opacity-60">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/audit"
            className="mt-2 inline-flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100"
          >
            Full audit log <ArrowRight className="size-3" />
          </Link>
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute -right-4 -top-4 size-24 blur-3xl",
          isConnected ? "bg-success/20" : "bg-warning/20",
        )}
      />
    </div>
  );
}
