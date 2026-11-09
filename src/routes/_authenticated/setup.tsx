import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { ConnectGuide, CopyBlock } from "@/components/ConnectGuide";
import { CopyPrompt, PROMPTS } from "@/components/AskAiPrompts";
import { Button } from "@/components/ui/button";
import { listMetaAccounts } from "@/lib/meta.functions";
import { getAdsOverview } from "@/lib/overview.functions";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Connect AI — Viral4All Ads" },
      {
        name: "description",
        content:
          "Connect Claude, ChatGPT, Gemini, Codex, Cursor, VS Code, automations or scripts to your Meta ads, with approvals and limits built in.",
      },
      { property: "og:title", content: "Connect AI — Viral4All Ads" },
      {
        property: "og:description",
        content: "Point any AI app or agent at your Meta ads in a few steps.",
      },
    ],
  }),
  component: Setup,
});

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="panel p-6 transition-all duration-300 ease-out hover:border-primary/40 hover:shadow-[0_18px_40px_-26px_hsl(var(--primary))]">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors ${
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground"
          }`}
        >
          {done ? <Check className="size-3.5" /> : index}
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <div className="mt-4 pl-10">{children}</div>
    </div>
  );
}

function Setup() {
  const accountsFn = useServerFn(listMetaAccounts);
  const { data: meta } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => accountsFn({}),
    retry: false,
  });
  const accounts = meta?.accounts ?? [];
  const overviewFn = useServerFn(getAdsOverview);
  const { data: overview } = useQuery({
    queryKey: ["ads-overview", "last_30d"],
    queryFn: () => overviewFn({ data: { datePreset: "last_30d" } }),
    retry: false,
  });
  const hasCampaigns = overview?.connected === true && overview.campaignCount > 0;

  return (
    <AppShell title="Connect AI">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Step index={1} title="Connect Meta" done={accounts.length > 0}>
            <p className="text-sm text-muted-foreground">
              {accounts.length > 0
                ? `${accounts.length} ad account${accounts.length > 1 ? "s" : ""} connected.`
                : "Connect the Meta account whose ads your AI should run."}
            </p>
            <Button
              asChild
              size="sm"
              variant={accounts.length > 0 ? "outline" : "default"}
              className="mt-4"
            >
              <Link to="/connections">{accounts.length > 0 ? "Manage" : "Connect Meta"}</Link>
            </Button>
          </Step>

          <Step index={2} title="Add this URL to your AI" done={false}>
            {/* the one thing every app needs, up front; per-app steps follow */}
            <CopyBlock label="Your AI URL" value={`${location.origin}/mcp`} />
            <div className="mt-5">
              <ConnectGuide />
            </div>
          </Step>

          <Step index={3} title="Give it something to do" done={hasCampaigns}>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((p) => (
                <CopyPrompt key={p} text={p} />
              ))}
            </div>
          </Step>
        </div>

        <aside className="panel h-fit p-6">
          <h2 className="text-[15px] font-semibold">What it can touch</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {[
              "Reads campaigns, ads and reports",
              "Pauses right away",
              "Budget and other changes wait for your OK",
              "Your limits always apply",
              "Any change can be undone",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-5 text-xs text-muted-foreground">
            Every call is in the{" "}
            <Link to="/audit" className="underline">
              activity log
            </Link>
            . Revoke access any time.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
