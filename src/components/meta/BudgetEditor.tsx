import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { updateMetaBudget, updateMetaSchedule } from "@/lib/meta.functions";
import { money } from "@/lib/meta/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BudgetEditor({
  objectId,
  adsetId,
  currency,
  dailyBudget,
  lifetimeBudget,
  startTime,
  endTime,
}: {
  objectId: string;
  adsetId: string;
  currency: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startTime: string | null;
  endTime: string | null;
}) {
  const qc = useQueryClient();
  const budgetFn = useServerFn(updateMetaBudget);
  const scheduleFn = useServerFn(updateMetaSchedule);

  const kind: "daily" | "lifetime" = lifetimeBudget ? "lifetime" : "daily";
  const current = (kind === "lifetime" ? lifetimeBudget : dailyBudget) ?? 0;

  // Meta returns timestamps like "2026-09-10T00:00:00+0000"; the date inputs hold "2026-09-10".
  // Compare dates only, so a saved budget never silently rewrites the schedule.
  const initialStart = startTime ? startTime.slice(0, 10) : "";
  const initialEnd = endTime ? endTime.slice(0, 10) : "";

  const [open, setOpen] = useState(false);
  // Typed text, so the box can be emptied and take cents; minor units are derived from it.
  const [text, setText] = useState(String(current / 100));
  const value = Math.round(Number(text) * 100);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  const save = useMutation({
    mutationFn: async () => {
      const budgetChanged = Math.round(value) !== Math.round(current);
      const scheduleChanged = start !== initialStart || end !== initialEnd;
      if (!budgetChanged && !scheduleChanged) return { skipped: true as const };

      if (budgetChanged) {
        await budgetFn({ data: { objectId, kind, minorUnits: Math.round(value) } });
      }
      if (scheduleChanged) {
        await scheduleFn({
          data: {
            adsetId,
            startTime: start ? new Date(`${start}T00:00:00Z`).toISOString() : null,
            endTime: end ? new Date(`${end}T23:59:00Z`).toISOString() : null,
          },
        });
      }
      return { skipped: false as const };
    },
    onSuccess: (result) => {
      toast.success(result?.skipped ? "Nothing changed" : "Sent to Meta");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["meta-ads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // The ad set spends its campaign's budget; that is edited on the campaign, not here.
  if (dailyBudget == null && lifetimeBudget == null) {
    return <span className="text-xs text-muted-foreground">Campaign budget</span>;
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Wallet className="size-3.5" />
        {money(current, currency)} {kind}
      </Button>
    );
  }

  const max = Math.max(current * 4, 50_000);

  return (
    <div className="w-full rounded-lg border border-border bg-surface-2 p-4 md:w-[26rem]">
      <p className="text-xs font-medium text-muted-foreground">
        {kind === "daily" ? "Daily budget" : "Lifetime budget"}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          min={100}
          max={max}
          step={100}
          value={value}
          onChange={(e) => setText(String(Number(e.target.value) / 100))}
          className="h-1.5 flex-1 accent-primary"
          aria-label="Budget slider"
        />
        <Input
          type="number"
          min={1}
          step="0.01"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-24"
          aria-label="Budget amount"
        />
        <span className="text-xs text-muted-foreground">{currency}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">
          Start
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          End (blank = always on)
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 text-foreground"
          />
        </label>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || !(value >= 100)}
        >
          {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Push to Meta
        </Button>
      </div>
    </div>
  );
}
