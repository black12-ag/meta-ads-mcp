import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/Reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listMetaAccounts } from "@/lib/meta.functions";
import { getAdsOverview } from "@/lib/overview.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "Guide — Viral4All Ads" },
      {
        name: "description",
        content:
          "Your step-by-step manual: connect Meta Ads, activate an account, build ads, wire MCP and API keys, and troubleshoot sync errors.",
      },
      { property: "og:title", content: "Guide — Viral4All Ads" },
      {
        property: "og:description",
        content:
          "Every step of running ads through Viral4All Ads, checked against your own account.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Manual,
});

type Step = {
  title: string;
  body: string;
  why: string;
  done: boolean;
  to?: string;
  cta?: string;
};

const TROUBLE = [
  {
    q: "“(#200) Requires ads_management permission”",
    a: "Your Meta user is missing a role on the ad account, or the OAuth grant skipped a scope. Reconnect from Connections and accept every permission, then confirm you are an admin on the ad account in Business Manager.",
  },
  {
    q: "Numbers look stale or the sync time is old",
    a: "Open Webhooks and check the handshake status. Failed syncs are retried with exponential backoff — the queue state and last error are shown there. A manual refresh on Overview forces a fresh pull.",
  },
  {
    q: "Meta rejected my creative",
    a: "Re-upload through the creative checklist. It flags dimension, aspect ratio, format and duration problems before the file is sent. Video also needs a moment to finish processing on Meta's side before it can be attached.",
  },
  {
    q: "An API call returns 401 or 403",
    a: "401 means the key is missing, wrong or revoked. 403 means the key is valid but lacks the scope for that endpoint — edit the key on API keys and enable the specific permission.",
  },
  {
    q: "My assistant does not see any tools",
    a: "Sign in when your AI app asks (most apps open a sign-in window the first time a tool runs), then reload the tool list. Read-only sign-ins and API keys only see the tools their permissions allow. Apps without sign-in need an API key as an Authorization: Bearer header.",
  },
];

function Manual() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const accountsFn = useServerFn(listMetaAccounts);
  const { data: meta } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => accountsFn({}),
    retry: false,
  });

  const overviewFn = useServerFn(getAdsOverview);
  const { data: overview } = useQuery({
    queryKey: ["ads-overview", "last_30d"],
    queryFn: () => overviewFn({ data: { datePreset: "last_30d" } }),
    retry: false,
  });

  const connected = Boolean(meta?.connected);
  const activated = Boolean(meta?.activeAdAccountId);
  const hasCampaigns = overview?.connected === true && overview.campaignCount > 0;

  const mcpUrl = `${origin || "https://ads.viral4all.com"}/mcp`;

  const steps: Step[] = [
    {
      title: "Connect Meta Ads",
      body: "Run the OAuth flow from Connections. Meta asks for ads_management, ads_read, business_management and Page access, then hands back your ad accounts and Pages.",
      why: "Tokens are exchanged and refreshed server-side, so nothing sensitive lives in your browser or your notes.",
      done: connected,
      to: "/connections",
      cta: connected ? "Manage connection" : "Connect now",
    },
    {
      title: "Activate an ad account and a Page",
      body: "Choose the account you want to operate on and the Facebook Page that ads publish from. You can switch at any time from the header.",
      why: "One active account drives every page, API key and MCP tool — no chance of editing the wrong account by accident.",
      done: activated,
      to: "/connections",
      cta: activated ? "Switch account" : "Pick an account",
    },
    {
      title: "Read the live numbers",
      body: "Overview shows spend, impressions, reach, clicks, results and the delivery trend. Analytics adds CTR, CPC, CPM and cost per result. Meta Ads lists each ad with its status and last sync.",
      why: "Everything is pulled from the Graph API on demand, so the console never disagrees with Ads Manager.",
      done: hasCampaigns,
      to: "/dashboard",
      cta: "Open Overview",
    },
    {
      title: "Launch or edit an ad",
      body: "Campaigns → New campaign runs the three-step wizard: objective and budget, targeting, then creative. Uploads pass the validation checklist before they reach Meta.",
      why: "Catching a wrong aspect ratio locally saves a rejected ad and a lost hour.",
      done: hasCampaigns,
      to: "/campaigns",
      cta: "Go to Campaigns",
    },
    {
      title: "Pause and resume without leaving the app",
      body: "Toggle a single ad or select several and act in bulk from the Ads control room. The change hits Meta immediately and is written to the audit log.",
      why: "Stopping spend should take one click, not a login to another dashboard.",
      done: hasCampaigns,
      to: "/ads",
      cta: "Ads control room",
    },
    {
      title: "Wire up your AI assistant",
      body: "Paste the MCP endpoint below into Claude, ChatGPT, Gemini, Codex or Cursor and sign in. Scripts and automations use an API key instead. Your assistant then gets the same tools this console uses.",
      why: "Tool calls are audited and scoped — the assistant cannot reach anything the UI could not.",
      done: false,
      to: "/setup",
      cta: "MCP setup",
    },
    {
      title: "Issue a scoped API key",
      body: "Create keys limited to exactly what a script needs: create ads, pause/resume, update creative, or upload media. Revoke instantly if a key leaks.",
      why: "A scheduling script should never hold permission to create spend it wasn't built for.",
      done: false,
      to: "/api-keys",
      cta: "API keys",
    },
    {
      title: "Confirm sync and review the trail",
      body: "Webhooks confirms Meta's verify handshake and the topics you are subscribed to. Audit log records every action with timestamp and result.",
      why: "Automation you cannot inspect is automation you cannot trust.",
      done: false,
      to: "/webhooks",
      cta: "Webhooks",
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  function copy(value: string) {
    navigator.clipboard.writeText(value);
    toast.success("Copied");
  }

  return (
    <AppShell
      title="Guide"
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/how-it-works">
            Public overview <ExternalLink className="size-3" />
          </Link>
        </Button>
      }
    >
      {/* Progress */}
      <Reveal>
        <div className="panel flex flex-wrap items-center gap-5 p-5">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Setup progress</p>
            <p className="mt-1 text-2xl font-semibold">
              {completed}
              <span className="text-base text-muted-foreground">
                /{steps.length} steps verified
              </span>
            </p>
          </div>
          <div className="h-1.5 min-w-[180px] flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${(completed / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </Reveal>

      {/* Steps */}
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={Math.min(i, 4) * 60}>
            <li className="panel group grid gap-5 p-6 transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_60px_-40px_hsl(var(--primary))] sm:grid-cols-[44px_1fr]">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border text-xs tabular-nums transition-colors duration-300",
                  s.done
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {s.done ? <Check className="size-4" /> : String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-semibold">{s.title}</h2>
                  {s.done ? <Badge>Done</Badge> : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground/90">
                  <span className="font-medium text-foreground">Why: </span>
                  {s.why}
                </p>
                {s.to ? (
                  <Link
                    to={s.to}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-transform duration-300 hover:translate-x-0.5"
                  >
                    {s.cta} →
                  </Link>
                ) : null}
              </div>
            </li>
          </Reveal>
        ))}
      </ol>

      {/* Endpoints */}
      <Reveal>
        <section className="panel mt-8 p-6">
          <h2 className="text-sm font-semibold">Your endpoints</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste these into your AI client or your scripts.
          </p>
          <div className="mt-4 space-y-2">
            {[
              { label: "MCP server", value: mcpUrl },
              {
                label: "REST base",
                value: `${origin || "https://ads.viral4all.com"}/api/public/v1`,
              },
              {
                label: "Every tool",
                value: `${origin || "https://ads.viral4all.com"}/api/public/v1/tools/{name}`,
              },
              {
                label: "OpenAPI",
                value: `${origin || "https://ads.viral4all.com"}/api/public/v1/openapi.json`,
              },
              { label: "For agents", value: `${origin || "https://ads.viral4all.com"}/llms.txt` },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-3 rounded-md border border-border bg-surface/50 px-4 py-3"
              >
                <span className="w-24 shrink-0 text-xs text-muted-foreground font-medium">
                  {row.label}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{row.value}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => copy(row.value)}
                  aria-label={`Copy ${row.label}`}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Troubleshooting */}
      <Reveal>
        <section className="mt-8">
          <h2 className="text-sm font-semibold">When something breaks</h2>
          <div className="panel mt-3 divide-y divide-border">
            {TROUBLE.map((t) => (
              <details key={t.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-medium transition-colors duration-300 group-open:text-primary hover:text-primary">
                  {t.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.a}</p>
              </details>
            ))}
          </div>
        </section>
      </Reveal>
    </AppShell>
  );
}
