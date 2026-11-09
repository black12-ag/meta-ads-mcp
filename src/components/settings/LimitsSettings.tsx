import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listAccountLimits, saveAccountLimits } from "@/lib/account-settings.functions";
import { fromMinor } from "@/lib/limits";
import { listMetaCampaigns } from "@/lib/meta.functions";

type Account = Awaited<ReturnType<typeof listAccountLimits>>["accounts"][number];

export function LimitsSettings() {
  const list = useServerFn(listAccountLimits);
  const limits = useQuery({ queryKey: ["account-limits"], queryFn: () => list({}) });
  const [picked, setPicked] = useState<string | null>(null);
  const accounts = limits.data?.accounts ?? [];
  const account =
    accounts.find((a) => a.account_id === (picked ?? limits.data?.activeAdAccountId)) ??
    accounts[0];

  return (
    <>
      {limits.isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : !account ? (
        <p className="text-sm text-muted-foreground">
          Connect your Meta account first. Your ad accounts show up here.
        </p>
      ) : (
        <div className="max-w-2xl space-y-6">
          {accounts.length > 1 ? (
            <select
              value={account.account_id}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Ad account"
              className="h-8 rounded-md border border-input bg-surface px-2.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.account_id})
                </option>
              ))}
            </select>
          ) : null}
          <LimitsForm key={account.account_id} account={account} />
        </div>
      )}
    </>
  );
}

const major = (minor: number | null, currency: string) =>
  minor == null ? "" : String(fromMinor(minor, currency));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function Field({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value}
          placeholder="No limit"
          onChange={(e) => onChange(e.target.value)}
          className="max-w-40"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

function LimitsForm({ account }: { account: Account }) {
  const qc = useQueryClient();
  const save = useServerFn(saveAccountLimits);
  const campaignsFn = useServerFn(listMetaCampaigns);
  const s = account.settings;
  const cur = account.currency;
  const [form, setForm] = useState({
    targetCpr: major(s?.target_cpr_cents ?? null, cur),
    monthlyBudget: major(s?.monthly_budget_cents ?? null, cur),
    cycleStartDay: String(s?.cycle_start_day ?? 1),
    notes: s?.notes ?? "",
    maxDailyBudget: major(s?.max_daily_budget_cents ?? null, cur),
    maxRaisePct: s?.max_raise_pct == null ? "" : String(s.max_raise_pct),
    maxChangesPerDay: s?.max_changes_per_day == null ? "" : String(s.max_changes_per_day),
  });
  const [protectedIds, setProtectedIds] = useState(new Set(s?.protected_ids ?? []));
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const campaigns = useQuery({
    queryKey: ["meta-campaigns", account.account_id, "today"],
    queryFn: () => campaignsFn({ data: { accountId: account.account_id, datePreset: "today" } }),
  });

  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          accountId: account.account_id,
          targetCpr: num(form.targetCpr),
          monthlyBudget: num(form.monthlyBudget),
          cycleStartDay: Number(form.cycleStartDay) || 1,
          notes: form.notes,
          maxDailyBudget: num(form.maxDailyBudget),
          maxRaisePct: num(form.maxRaisePct),
          maxChangesPerDay: num(form.maxChangesPerDay),
          protectedIds: [...protectedIds],
        },
      }),
    onSuccess: () => {
      toast.success("Saved. AI requests on this account now follow these limits.");
      void qc.invalidateQueries({ queryKey: ["account-limits"] });
    },
    onError: () =>
      toast.error("Not saved. Check the numbers: whole numbers for %, days and changes."),
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        saving.mutate();
      }}
    >
      <section className="panel space-y-5 p-6">
        <h2 className="text-sm font-semibold">Goals</h2>
        <Field
          label="Target cost per result"
          hint="What a good result costs you. Your AI assistant sees this when it plans."
          value={form.targetCpr}
          onChange={set("targetCpr")}
          suffix={cur}
        />
        <Field
          label="Monthly budget"
          hint="What you plan to spend per month. Approval pages show how much of it is already spent."
          value={form.monthlyBudget}
          onChange={set("monthlyBudget")}
          suffix={cur}
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Budget month starts on day</span>
          <Input
            type="number"
            min={1}
            max={28}
            value={form.cycleStartDay}
            onChange={(e) => set("cycleStartDay")(e.target.value)}
            className="max-w-24"
          />
          <span className="block text-xs text-muted-foreground">
            1 to 28, e.g. your billing day.
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Notes for your AI</span>
          <Textarea
            value={form.notes}
            maxLength={1000}
            rows={3}
            onChange={(e) => set("notes")(e.target.value)}
            placeholder="e.g. Promo ends 30 March. Never target under 18."
          />
        </label>
      </section>

      <section className="panel space-y-5 p-6">
        <div>
          <h2 className="text-sm font-semibold">Limits for AI requests</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Empty means no limit. Limits only apply to your AI.
          </p>
        </div>
        <Field
          label="Highest daily budget"
          hint="The AI can't ask for a daily budget above this."
          value={form.maxDailyBudget}
          onChange={set("maxDailyBudget")}
          suffix={cur}
        />
        <Field
          label="Biggest raise per change"
          hint="The AI can't raise a budget by more than this in one step."
          value={form.maxRaisePct}
          onChange={set("maxRaisePct")}
          suffix="%"
        />
        <Field
          label="AI changes per day"
          hint="Approved AI changes per day on this ad account."
          value={form.maxChangesPerDay}
          onChange={set("maxChangesPerDay")}
          suffix="per day"
        />
      </section>

      <section className="panel space-y-3 p-6">
        <div>
          <h2 className="text-sm font-semibold">Protected campaigns</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The AI can't change these campaigns or any ad set or ad inside them.
          </p>
        </div>
        {campaigns.isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : campaigns.isError ? (
          <p className="text-sm text-muted-foreground">Couldn't load campaigns from Meta.</p>
        ) : (
          <ul className="space-y-2">
            {campaigns.data?.campaigns.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={protectedIds.has(c.id)}
                    onCheckedChange={(on) =>
                      setProtectedIds((ids) => {
                        const next = new Set(ids);
                        if (on === true) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.effectiveStatus}</span>
                </label>
              </li>
            ))}
            {!campaigns.data?.campaigns.length ? (
              <li className="text-sm text-muted-foreground">
                No campaigns on this ad account yet.
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <Button type="submit" disabled={saving.isPending}>
        {saving.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}{" "}
        Save
      </Button>
    </form>
  );
}
