import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CircleAlert, CircleCheck, Loader2, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decideApproval, getApproval, undoApproval } from "@/lib/approvals.functions";
import { APPROVAL_TITLES, requesterLabel } from "@/lib/approval-summary";

export const Route = createFileRoute("/_authenticated/approve/$id")({
  head: () => ({
    meta: [{ title: "Approve a change — Viral4All Ads" }, { name: "robots", content: "noindex" }],
  }),
  component: ApprovePage,
});

// Postgres jsonb reorders keys, so show them in reading order.
const ORDER = [
  "change",
  "reason",
  "object",
  "objects",
  "ad",
  "adset",
  "budget",
  "currency",
  "from",
  "to",
  "changes",
  "note",
  "meta_validation",
  "checks",
];

type Change = { field: string; from: unknown; to: unknown };
type Check = { label: string; ok: boolean; detail: string };
const isList = <T,>(v: unknown, key: string): v is T[] =>
  Array.isArray(v) && v.every((x) => x && typeof x === "object" && key in x);
const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (isList<Change>(value, "field")) {
    return (
      <ul className="space-y-1">
        {value.map((c) => (
          <li key={c.field}>
            <span className="text-muted-foreground">{c.field}:</span>{" "}
            <span className="line-through decoration-muted-foreground/60">
              {c.from == null ? "—" : String(c.from)}
            </span>{" "}
            → <span className="font-medium">{String(c.to)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (isList<Check>(value, "ok")) {
    return (
      <ul className="space-y-1">
        {value.map((c) => (
          <li key={c.label} className="flex items-start gap-1.5">
            {c.ok ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            )}
            <span>
              <span className="font-medium">{c.label}.</span> {c.detail}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const named = value as { id?: unknown; name?: unknown };
  if (typeof value === "object" && !Array.isArray(value) && "id" in named && "name" in named) {
    return (
      <span>
        {String(named.name ?? "Unnamed")}{" "}
        <span className="font-mono text-xs text-muted-foreground">{String(named.id)}</span>
      </span>
    );
  }
  if (typeof value === "object") {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span>{String(value)}</span>;
}

function ApprovePage() {
  const { id } = Route.useParams();
  const get = useServerFn(getApproval);
  const decideFn = useServerFn(decideApproval);
  const undoFn = useServerFn(undoApproval);
  const [note, setNote] = useState("");
  const approval = useQuery({
    queryKey: ["approval", id],
    queryFn: () => get({ data: { id } }),
    retry: false,
  });
  const decision = useMutation({
    mutationFn: (approve: boolean) => decideFn({ data: { id, approve, note } }),
    onSettled: () => approval.refetch(),
  });
  const revert = useMutation({
    mutationFn: () => undoFn({ data: { id } }),
    onSuccess: (out) =>
      out.error ? toast.error(out.error) : toast.success("Undone. It's back as it was."),
    onSettled: () => approval.refetch(),
  });

  const a = approval.data;
  const summary = a ? (JSON.parse(a.summaryJson) as Record<string, unknown>) : {};

  return (
    <AppShell title="Approve a change">
      <div className="panel max-w-2xl p-6">
        {approval.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !a ? (
          <p className="text-sm text-muted-foreground">
            This request doesn't exist or belongs to another account.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">{APPROVAL_TITLES[a.action] ?? a.action}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Requested by {requesterLabel(a.requestedVia)}
            </p>
            <dl className="mt-5 space-y-3 text-sm">
              {Object.entries(summary)
                .sort(([a], [b]) => rank(a) - rank(b))
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[140px_1fr] gap-3">
                    <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                    <dd>
                      <Value value={v} />
                    </dd>
                  </div>
                ))}
            </dl>

            {a.decision === "approved" ? (
              <div className="mt-6 rounded-lg border border-border p-4 text-sm">
                {a.error ? (
                  <p className="text-destructive">Approved, but it didn't run: {a.error}</p>
                ) : (
                  <>
                    <p className="font-medium">
                      {a.undoneAt
                        ? `Applied, then undone ${new Date(a.undoneAt).toLocaleString()}.`
                        : "Approved and applied. You can tell your assistant."}
                    </p>
                    {a.resultJson ? (
                      <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">
                        {a.resultJson}
                      </pre>
                    ) : null}
                    {a.canUndo ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        disabled={revert.isPending}
                        onClick={() => {
                          if (confirm("Put this back exactly as it was before the change?"))
                            revert.mutate();
                        }}
                      >
                        {revert.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="size-3.5" />
                        )}{" "}
                        Undo
                      </Button>
                    ) : null}
                  </>
                )}
                {a.note ? <p className="mt-3 text-muted-foreground">Your note: {a.note}</p> : null}
              </div>
            ) : a.decision === "rejected" ? (
              <p className="mt-6 text-sm text-muted-foreground">
                You rejected this change.{a.note ? ` Your note: ${a.note}` : ""}
              </p>
            ) : a.expired ? (
              <p className="mt-6 text-sm text-muted-foreground">
                This request expired. Ask your assistant again if you still want it.
              </p>
            ) : (
              <div className="mt-8 space-y-3">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  aria-label="Note for your assistant"
                  placeholder="Optional note for your assistant, e.g. why you rejected it"
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    disabled={decision.isPending}
                    onClick={() => decision.mutate(false)}
                  >
                    Reject
                  </Button>
                  <Button disabled={decision.isPending} onClick={() => decision.mutate(true)}>
                    {decision.isPending ? <Loader2 className="size-4 animate-spin" /> : "Approve"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
