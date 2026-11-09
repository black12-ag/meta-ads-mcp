import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, ChevronDown, ChevronsUpDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listMetaAccounts, setMetaActive } from "@/lib/meta.functions";
import { cn } from "@/lib/utils";

/**
 * Switch the ad account every surface (dashboard, MCP, API) acts on.
 * Accounts from every linked Meta login appear in one list.
 */
export function AccountSwitcher({
  className,
  align = "right",
  full = false,
}: {
  className?: string;
  /** which edge the menu lines up with */
  align?: "left" | "right";
  /** sidebar version: full width, two lines */
  full?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fetchAccounts = useServerFn(listMetaAccounts);
  const activate = useServerFn(setMetaActive);

  const { data, isLoading } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => fetchAccounts({}),
    retry: false,
  });

  const choose = useMutation({
    mutationFn: (adAccountId: string) => activate({ data: { adAccountId } }),
    onSuccess: () => {
      setOpen(false);
      toast.success("Ad account switched");
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      qc.invalidateQueries({ queryKey: ["meta-overview"] });
      qc.invalidateQueries({ queryKey: ["meta-ads"] });
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["meta-changes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <span
        className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}
      >
        <Loader2 className="size-3.5 animate-spin" /> Loading accounts…
      </span>
    );
  }
  if (!data?.connected || !data.accounts.length) return null;

  const active = data.accounts.find((a) => a.account_id === data.activeAdAccountId);

  return (
    <div className={cn("relative", className)}>
      {full ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 text-left shadow-[0_1px_2px_hsl(var(--shadow)/0.06)] transition-colors hover:border-primary/40"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-4 font-semibold">
              {active?.name ?? "Choose ad account"}
            </span>
            {active ? (
              <span className="block truncate font-mono text-[11px] leading-4 text-muted-foreground">
                act_••{active.account_id.slice(-4)} · {active.currency}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex h-8 max-w-[16rem] cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <Building2 className="size-3.5 text-primary" />
          <span className="truncate">{active?.name ?? "Choose ad account"}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      )}

      {open ? (
        <div
          className={cn(
            "absolute z-30 mt-2 w-72 rounded-lg border border-border bg-popover p-1.5 shadow-[0_12px_32px_-8px_hsl(var(--shadow)/0.25)] animate-in fade-in zoom-in-95 duration-150",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground font-medium">
            {data.accounts.length} ad account{data.accounts.length === 1 ? "" : "s"}
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {data.accounts.map((a) => {
              const isActive = a.account_id === data.activeAdAccountId;
              return (
                <li key={a.account_id}>
                  <button
                    type="button"
                    disabled={choose.isPending}
                    onClick={() => choose.mutate(a.account_id)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60",
                      isActive && "bg-accent",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0 text-primary",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {a.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        act_{a.account_id} · {a.currency}
                        {a.business_name ? ` · ${a.business_name}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
