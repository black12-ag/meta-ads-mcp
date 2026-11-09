import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getWebhookStatus, listSyncRetries, runRetryQueue } from "@/lib/meta-insights.functions";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhook setup & sync health — Viral4All Ads" },
      {
        name: "description",
        content:
          "Step-by-step Meta webhook setup: which topics to subscribe to, live verify-handshake status, delivery history and automatic retry queue for failed syncs.",
      },
      { property: "og:title", content: "Webhook setup & sync health — Viral4All Ads" },
      {
        property: "og:description",
        content:
          "Confirm the Meta webhook handshake, subscribe the right topics and watch failed syncs recover automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WebhookSetupPage,
});

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function inFuture(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "due now";
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.round(mins / 60)}h`;
}

function Row({ ok, title, detail }: { ok: boolean | null; title: string; detail: string }) {
  const Icon = ok === null ? Timer : ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-4 py-3">
      <Icon
        className={`mt-0.5 size-4 ${ok === null ? "text-muted-foreground" : ok ? "text-success" : "text-destructive"}`}
      />
      <div>
        <p className="text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function WebhookSetupPage() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const fetchStatus = useServerFn(getWebhookStatus);
  const fetchRetries = useServerFn(listSyncRetries);
  const drain = useServerFn(runRetryQueue);

  const statusQuery = useQuery({
    queryKey: ["webhook-status"],
    queryFn: () => fetchStatus({}),
    retry: false,
    refetchInterval: 30_000,
  });
  const retriesQuery = useQuery({
    queryKey: ["sync-retries"],
    queryFn: () => fetchRetries({}),
    retry: false,
    refetchInterval: 30_000,
  });

  const drainMutation = useMutation({
    mutationFn: () => drain({}),
    onSuccess: (r) => {
      toast.success(
        r.due ? `${r.recovered} recovered · ${r.stillFailing} still failing` : "Nothing due yet",
      );
      queryClient.invalidateQueries({ queryKey: ["sync-retries"] });
      queryClient.invalidateQueries({ queryKey: ["webhook-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = statusQuery.data;
  const callbackUrl = origin ? `${origin}/api/public/meta/webhook` : "…";
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <AppShell
      title="Meta webhooks"
      actions={
        <Button
          variant="outline"
          onClick={() => statusQuery.refetch()}
          disabled={statusQuery.isFetching}
          className="gap-2 transition-transform hover:-translate-y-0.5"
        >
          {statusQuery.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Recheck
        </Button>
      }
    >
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">1. Callback URL</h2>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/40 p-4">
            <code className="flex-1 overflow-x-auto rounded bg-nav-button px-3 py-2 font-mono text-xs text-foreground">
              {callbackUrl}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(callbackUrl)}
              className="gap-1.5"
            >
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            In your Meta app, open Webhooks, then "Add subscription" and paste this URL. The verify
            token is stored on the server as{" "}
            <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">2. Handshake status</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <Row
              ok={status ? status.configured.verifyToken : null}
              title="Verify token configured"
              detail={
                status?.configured.verifyToken
                  ? "Meta's subscription check can be answered."
                  : "Missing. The handshake will be rejected."
              }
            />
            <Row
              ok={status ? status.configured.appSecret : null}
              title="App secret configured"
              detail={
                status?.configured.appSecret
                  ? "Incoming events are signature-verified."
                  : "Missing. Signed events will be rejected."
              }
            />
            <Row
              ok={status ? status.handshake.verified : null}
              title="Verify handshake"
              detail={
                status?.handshake.lastAttemptAt
                  ? `${status.handshake.verified ? "Confirmed" : (status.handshake.lastError ?? "Rejected")} · ${timeAgo(status.handshake.lastAttemptAt)}`
                  : "Meta hasn't called the callback URL yet."
              }
            />
            <Row
              ok={status ? Boolean(status.lastWebhookSyncAt) : null}
              title="Webhook-triggered sync"
              detail={
                status?.lastWebhookSyncAt
                  ? `Last ran ${timeAgo(status.lastWebhookSyncAt)}`
                  : "No event has triggered a sync yet."
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">3. Subscribe these topics</h2>
          <div className="space-y-2">
            {(status?.topics ?? []).map((t) => (
              <div
                key={`${t.object}.${t.field}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3 transition-colors hover:border-primary/40"
              >
                <span className="rounded bg-nav-button px-2 py-0.5 font-mono text-[11px] text-foreground">
                  {t.object}
                </span>
                <span className="font-mono text-xs text-primary">{t.field}</span>
                <span className="text-xs text-muted-foreground">{t.why}</span>
              </div>
            ))}
            {!status ? <p className="text-sm text-muted-foreground">Loading topics…</p> : null}
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Your Meta app needs <code className="font-mono">ads_management</code> and{" "}
            <code className="font-mono">ads_read</code> approved before ad-account topics deliver.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Automatic retries</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => drainMutation.mutate()}
              disabled={drainMutation.isPending}
              className="gap-1.5"
            >
              {drainMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Run due retries
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Failed syncs retry on their own, up to an hour apart. Expired logins need a reconnect.
          </p>
          <div className="space-y-2">
            {(retriesQuery.data ?? []).map((r: any) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3"
              >
                <span
                  className={`inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium ${
                    r.status === "recovered"
                      ? "bg-success/15 text-success"
                      : r.status === "exhausted"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning"
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  attempt {r.attempts}/{r.max_attempts} · {r.last_error_kind ?? "unknown"}
                </span>
                <span className="text-xs text-foreground">{r.last_error ?? "—"}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.status === "pending"
                    ? `next ${inFuture(r.next_attempt_at)}`
                    : timeAgo(r.updated_at)}
                </span>
              </div>
            ))}
            {!(retriesQuery.data ?? []).length ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" /> Nothing to retry.
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent deliveries</h2>
          <ul className="space-y-2">
            {(status?.deliveries ?? []).map((d: any) => (
              <li
                key={d.id}
                className="flex flex-wrap gap-2 rounded-lg border border-border bg-background/40 px-4 py-2 text-xs text-muted-foreground"
              >
                <span className="text-foreground">{d.object ?? "event"}</span>
                <span className="rounded bg-nav-button px-1.5 py-0.5">{d.field ?? "—"}</span>
                {d.error_message ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="size-3" /> {d.error_message}
                  </span>
                ) : null}
                <span className="ml-auto">{timeAgo(d.created_at)}</span>
              </li>
            ))}
            {!(status?.deliveries ?? []).length ? (
              <li className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing delivered yet. Once the topics are subscribed, events land here.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
