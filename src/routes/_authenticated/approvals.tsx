import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { decideApproval, listApprovals } from "@/lib/approvals.functions";
import {
  APPROVAL_TITLES,
  approvalHeadline,
  canQuickApprove,
  requesterLabel,
} from "@/lib/approval-summary";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals — Viral4All Ads" }] }),
  component: ApprovalsPage,
});

const ago = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
};

// Status badges: square-ish (radius 6) so they never read as buttons; the dot plus the word carry meaning.
const STATUS_STYLE: Record<string, string> = {
  approved: "bg-success/10 text-success",
  rejected: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  undone: "bg-muted text-muted-foreground",
};

function ApprovalsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listApprovals);
  const decideFn = useServerFn(decideApproval);
  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: () => list({}),
    refetchInterval: 30_000,
  });
  const decision = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideFn({ data: v }),
    onSuccess: (out, v) => {
      if (out.error) toast.error(`It didn't run: ${out.error}`);
      else toast.success(v.approve ? "Approved and applied." : "Rejected. Nothing changed.");
    },
    onError: () => toast.error("That request is no longer waiting."),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-count"] });
    },
  });

  const rows = approvals.data ?? [];
  const waiting = rows.filter((r) => r.status === "waiting");
  const decided = rows.filter((r) => r.status !== "waiting");

  return (
    <AppShell title="Approvals">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          Waiting for you
          {waiting.length ? (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white tabular-nums">
              {waiting.length}
            </span>
          ) : null}
        </h2>
        {approvals.isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : null}
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {waiting.map((r) => {
              const summary = JSON.parse(r.summaryJson) as Record<string, unknown>;
              const busy = decision.isPending && decision.variables?.id === r.id;
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.18 } }}
                  transition={{ type: "spring", duration: 0.4, bounce: 0 }}
                  className="panel flex flex-wrap items-center gap-4 p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-primary font-medium">
                      {APPROVAL_TITLES[r.action] ?? r.action}
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {approvalHeadline(r.action, summary)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested by {requesterLabel(r.requestedVia)} · {ago(r.createdAt)} ·{" "}
                      <Link to="/approve/$id" params={{ id: r.id }} className="underline">
                        details
                      </Link>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => decision.mutate({ id: r.id, approve: false })}
                    >
                      <X className="size-3.5" /> Reject
                    </Button>
                    {canQuickApprove(r.action, summary) ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => decision.mutate({ id: r.id, approve: true })}
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}{" "}
                        Approve
                      </Button>
                    ) : (
                      <Button size="sm" asChild>
                        <Link to="/approve/$id" params={{ id: r.id }}>
                          Review
                        </Link>
                      </Button>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {approvals.isError ? (
          <p className="panel p-6 text-sm text-destructive">
            Couldn't load your approvals. {(approvals.error as Error).message}
          </p>
        ) : !approvals.isLoading && !waiting.length ? (
          <div className="panel flex items-center gap-4 p-6 text-sm text-muted-foreground">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-foreground">You're all caught up.</span>
              Requests from your AI show up here.
            </span>
          </div>
        ) : null}
      </section>

      {decided.length ? (
        <section className="mt-10 space-y-2">
          <h2 className="text-[15px] font-semibold">Recent decisions</h2>
          <ul className="panel divide-y divide-border overflow-hidden">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span
                  className={`inline-flex h-5 w-24 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground"}`}
                >
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  {r.status}
                </span>
                <Link
                  to="/approve/$id"
                  params={{ id: r.id }}
                  className="min-w-0 flex-1 truncate hover:text-primary"
                >
                  {approvalHeadline(r.action, JSON.parse(r.summaryJson) as Record<string, unknown>)}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {ago(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
