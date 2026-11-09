import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { listAuditEntries } from "@/lib/audit.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Viral4All Ads" },
      {
        name: "description",
        content:
          "Trace every API key action — ad creation, pause and resume, creative updates, media uploads and syncs — with timestamps and results.",
      },
      { property: "og:title", content: "Audit log — Viral4All Ads" },
      {
        property: "og:description",
        content: "A timestamped record of every action taken with your API keys.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

const LABELS: Record<string, string> = {
  "ads.list": "Listed ads",
  "ads.create": "Created ad",
  "ads.status": "Paused / resumed ads",
  "ads.creative": "Updated creative",
  "ads.budget": "Changed budget",
  "media.upload": "Uploaded media",
  "sync.run": "Triggered sync",
  "keys.create": "Created API key",
  "keys.revoke": "Revoked API key",
  "keys.scopes": "Changed key permissions",
  "account.switch": "Switched ad account",
  "connection.connect": "Connected Meta account",
  "connection.disconnect": "Disconnected Meta account",
  "connection.sync": "Synced pages & ad accounts",
};

const FILTERS = [
  { value: "", label: "All actions" },
  { value: "ads.create", label: "Create" },
  { value: "ads.status", label: "Pause / resume" },
  { value: "ads.creative", label: "Creative" },
  { value: "ads.budget", label: "Budget" },
  { value: "media.upload", label: "Media" },
  { value: "sync.run", label: "Sync" },
  { value: "connection.connect", label: "Connected" },
  { value: "connection.disconnect", label: "Disconnected" },
];

function AuditPage() {
  const [action, setAction] = useState("");
  const [onlyFailures, setOnlyFailures] = useState(false);
  const fetchEntries = useServerFn(listAuditEntries);

  const query = useQuery({
    queryKey: ["audit-log", action, onlyFailures],
    queryFn: () =>
      fetchEntries({ data: { limit: 150, action: action || undefined, onlyFailures } }),
    retry: false,
  });

  const rows = query.data ?? [];

  return (
    <AppShell
      title="Activity log"
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn(query.isFetching && "animate-spin")} />
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setAction(f.value)}
            className={cn(
              "h-7 rounded-md border px-2.5 text-xs font-medium transition-colors",
              action === f.value
                ? "border-primary/60 bg-nav-button text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyFailures}
            onChange={(e) => setOnlyFailures(e.target.checked)}
            className="size-3.5 accent-current"
          />
          Failures only
        </label>
      </div>

      {query.isLoading ? (
        <div className="panel flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading audit entries…
        </div>
      ) : query.isError ? (
        <div className="panel p-6 text-sm text-destructive">{(query.error as Error).message}</div>
      ) : rows.length === 0 ? (
        <div className="panel p-6 text-sm text-muted-foreground">Nothing recorded yet.</div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs text-muted-foreground font-medium">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {LABELS[r.action] ?? r.action}
                    {r.path ? (
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {r.method} {r.path}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground uppercase">{r.source}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {r.key_prefix ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        r.ok ? "text-primary" : "text-destructive",
                      )}
                    >
                      {r.ok ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                      {r.status_code ?? (r.ok ? "OK" : "Failed")}
                      {r.duration_ms != null ? (
                        <span className="text-muted-foreground">· {r.duration_ms}ms</span>
                      ) : null}
                    </span>
                  </td>
                  <td className="max-w-[22rem] px-4 py-3 text-xs text-muted-foreground">
                    <span className="line-clamp-2 break-words">
                      {r.error ??
                        (r.detail && Object.keys(r.detail as object).length
                          ? JSON.stringify(r.detail)
                          : "—")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
