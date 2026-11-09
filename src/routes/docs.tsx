import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { ConnectGuide, CopyBlock, Troubleshooting } from "@/components/ConnectGuide";
import { LandingNav } from "@/components/LandingNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { useSession } from "@/hooks/use-session";
import { API_SCOPES } from "@/lib/api-scopes";
import { getDocsTools } from "@/lib/docs.functions";
import { cn } from "@/lib/utils";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — Viral4All Ads" },
      {
        name: "description",
        content:
          "Connect any AI app, how approvals and limits work, every tool, the REST API, CLI, webhooks, the Claude plugin and troubleshooting.",
      },
      { property: "og:title", content: "Viral4All Ads docs" },
      {
        property: "og:description",
        content: "Run your Meta ads from any AI app, with approvals and limits built in.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  loader: () => getDocsTools(),
  component: Docs,
});

// Docs show the canonical address, wherever they're opened.
const SITE = "https://ads.viral4all.com";
const CLI = "npx -y viral4all-ads";

type Tool = Awaited<ReturnType<typeof getDocsTools>>[number];

const KIND: Record<Tool["kind"], { label: string; className: string }> = {
  read: { label: "Reads", className: "border-border text-muted-foreground" },
  now: { label: "Runs at once", className: "border-warning/40 bg-warning/10 text-warning" },
  approval: { label: "Needs your OK", className: "border-primary/40 bg-primary/10 text-primary" },
  notes: { label: "Workspace note", className: "border-border text-muted-foreground" },
};

const SECTIONS = [
  { id: "quickstart", label: "Quick start", keywords: "start sign up account connect meta first" },
  {
    id: "connect",
    label: "Connect your AI",
    keywords: "claude chatgpt gemini codex cursor vs code windsurf n8n app",
  },
  {
    id: "safety",
    label: "Approvals & limits",
    keywords: "approval approve limits undo protected budget audit safe",
  },
  {
    id: "tools",
    label: "Tools",
    keywords: "tools list report insights pause resume budget creative",
  },
  {
    id: "api",
    label: "REST API",
    keywords: "api rest http curl openapi key bearer endpoint error zapier make n8n gpt actions",
  },
  { id: "cli", label: "CLI", keywords: "cli terminal npx command script json" },
  {
    id: "webhooks",
    label: "Webhooks",
    keywords: "webhook events slack discord signature hmac verify payload",
  },
  {
    id: "plugin",
    label: "Plugin & skills",
    keywords: "plugin claude code skills marketplace github zip",
  },
  { id: "mcp", label: "MCP details", keywords: "mcp oauth url scopes registry llms.txt discovery" },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    keywords: "problem error fix not working blocked expired sync proxy",
  },
  { id: "support", label: "Support", keywords: "help contact email security privacy delete" },
] as const;

const has = (text: string, q: string) => text.toLowerCase().includes(q);
const A = "text-primary underline";

function Section({
  id,
  title,
  hidden,
  children,
}: {
  id: string;
  title: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} hidden={hidden} className="scroll-mt-48 lg:scroll-mt-28">
      <h2 className="text-2xl font-bold tracking-[-0.02em]">{title}</h2>
      <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

const code = (text: string) => (
  <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-foreground">
    {text}
  </code>
);

function Docs() {
  const tools = Route.useLoaderData();
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>("quickstart");
  const q = query.trim().toLowerCase();

  const toolHits = useMemo(
    () => tools.filter((t) => !q || has(`${t.name} ${t.title} ${t.description}`, q)),
    [tools, q],
  );
  const shown = (s: (typeof SECTIONS)[number]) =>
    !q || has(`${s.label} ${s.keywords}`, q) || (s.id === "tools" && toolHits.length > 0);
  const visible = SECTIONS.filter(shown);

  // Highlight the section being read in the jump menu.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const searchBox = (
    <label className="relative block">
      <span className="sr-only">Search the docs</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search: budget, webhook, Gemini…"
        className="w-full rounded-md border border-input bg-surface py-2 pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
      />
    </label>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav signedIn={Boolean(user)} />

      <header className="relative overflow-hidden border-b border-border px-6 pt-36 pb-14 lg:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-6xl">
          <Reveal delay={70}>
            <h1 className="max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
              Docs
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Setup, tools, API, CLI and webhooks.
            </p>
          </Reveal>
        </div>
      </header>

      <div className="sticky top-14 z-30 border-b border-border bg-background/90 px-6 py-3 backdrop-blur lg:hidden">
        {searchBox}
        <nav aria-label="On this page" className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {visible.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[220px_1fr] lg:px-16">
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-5">
            {searchBox}
            <nav aria-label="On this page">
              <ol className="space-y-1 border-l border-border">
                {visible.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      aria-current={active === s.id ? "location" : undefined}
                      className={cn(
                        "-ml-px block border-l py-1 pl-4 text-sm transition-colors",
                        active === s.id
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>

        <main className="min-w-0 space-y-20">
          {!visible.length ? (
            <p className="text-sm text-muted-foreground">
              Nothing matches “{query}”. Try another word, or ask us on{" "}
              <Link to="/support" className="text-primary underline">
                Support
              </Link>
              .
            </p>
          ) : null}

          <Section id="quickstart" title="Quick start" hidden={!shown(SECTIONS[0])}>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <Link to="/auth" className={A}>
                  Create your account
                </Link>{" "}
                (free) and sign in.
              </li>
              <li>
                Open <strong>Meta connection</strong>, connect Facebook and pick an ad account.
              </li>
              <li>
                Paste {code(`${SITE}/mcp`)} into your AI app and sign in when it asks (steps for
                every app below).
              </li>
              <li>
                Ask: “How did my ads do this week?” Then set your safety limits on{" "}
                <strong>Goals & limits</strong>.
              </li>
            </ol>
            <Link
              to={user ? "/dashboard" : "/auth"}
              className="group mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline transition-[filter] hover:brightness-110"
            >
              {user ? "Open the console" : "Start free"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p>
              Prefer a guided tour? Read{" "}
              <Link to="/how-it-works" className={A}>
                How it works
              </Link>
              .
            </p>
          </Section>

          <Section id="connect" title="Connect your AI" hidden={!shown(SECTIONS[1])}>
            <p>Pick your app for the exact steps. Most apps just need the URL and a sign-in.</p>
            <div className="panel p-6 text-foreground">
              <ConnectGuide />
            </div>
          </Section>

          <Section id="safety" title="Approvals & limits" hidden={!shown(SECTIONS[2])}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Approval links",
                  "Resuming ads, budgets, creative, targeting and archiving never run from the chat. Your AI gets a link; the change runs only when you open it, sign in and press Approve. Links last 30 minutes.",
                ],
                [
                  "Hard limits",
                  "On Goals & limits, set the highest daily budget, the biggest raise per change, AI changes per day and protected campaigns. Our server blocks anything outside them, even approved requests.",
                ],
                [
                  "Undo",
                  "Every applied change keeps what it replaced. Press Undo on its approval page to put it back (archiving can't be undone).",
                ],
                [
                  "Activity log",
                  "Every AI and API action is recorded with who asked, what and when. Alerts email you when spend jumps or results drop.",
                ],
              ].map(([title, body]) => (
                <div key={title} className="panel p-5">
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-2">{body}</p>
                </div>
              ))}
            </div>
            <p>
              Pauses run at once (they only stop spend). New campaigns and copies always start
              paused.
            </p>
          </Section>

          <Section id="tools" title="Tools" hidden={!shown(SECTIONS[3])}>
            <p>
              The same tools are in every AI app, the REST API and the CLI. This list comes from the
              live server. Money is in minor units: {code("2500")} is $25.00.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground font-medium">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Tool
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      What it does
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Runs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(toolHits.length ? toolHits : tools).map((t) => (
                    <tr key={t.name} className="align-top">
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{t.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{t.title}.</span>{" "}
                        {t.description.split(/(?<=\.)\s/)[0]}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap",
                            KIND[t.kind].className,
                          )}
                        >
                          {KIND[t.kind].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="api" title="REST API" hidden={!shown(SECTIONS[4])}>
            <p>
              Every tool is also a plain HTTP endpoint, for scripts, Zapier, Make, n8n and ChatGPT
              GPT Actions. Make a key on the{" "}
              <Link to="/api-keys" className={A}>
                API keys
              </Link>{" "}
              page and send it as {code("Authorization: Bearer sk_meta_…")}. Import the{" "}
              <a href="/api/public/v1/openapi.json" className={A}>
                OpenAPI schema
              </a>{" "}
              to get every endpoint at once.
            </p>
            <CopyBlock
              label="Run a tool"
              value={`curl -X POST ${SITE}/api/public/v1/tools/meta_get_insights \\\n  -H "Authorization: Bearer sk_meta_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"level":"campaign","datePreset":"last_7d","breakdowns":["age"]}'`}
            />
            <p>
              {code("GET /api/public/v1/tools")} lists the tools your key may use, with their input
              schemas. Changes that spend money answer with an approval link instead of running:
            </p>
            <CopyBlock
              label="A change waiting for approval"
              value={`{\n  "status": "approval_required",\n  "approve_url": "${SITE}/approve/…",\n  "confirm_token": "cfm_…",\n  "expires_in_seconds": 1800,\n  "summary": { "object": { "name": "Spring sale" }, "budget": "daily", "from": "$20.00", "to": "$25.00" }\n}`}
            />
            <p>
              Then call {code("meta_confirm_action")} with the {code("confirm_token")} to read the
              outcome: waiting, done, rejected (with your note), failed or undone.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-border">
                  {[
                    ["401", "The key is missing, wrong or revoked."],
                    ["403", "The key lacks the permission this tool needs; the error names it."],
                    ["404", "No tool by that name."],
                    [
                      "400",
                      "Invalid input, or the tool refused (for example “Blocked by your limits: …”).",
                    ],
                  ].map(([status, meaning]) => (
                    <tr key={status}>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{status}</td>
                      <td className="px-4 py-2.5">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="pt-2 text-sm font-semibold text-foreground">Key permissions</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {API_SCOPES.map((s) => (
                <li key={s.value}>
                  {code(s.value)} <strong>{s.label}</strong>: {s.description}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="cli" title="CLI" hidden={!shown(SECTIONS[5])}>
            <p>
              Sign in once in your browser, then any terminal, script or coding agent can use every
              tool. Needs Node.js 18 or newer. Add {code("--json")} for machine output.
            </p>
            <CopyBlock
              label="Terminal"
              value={`${CLI} login              # browser sign-in\n${CLI} login --key sk_meta_…  # or an API key\n${CLI} ads\n${CLI} insights --level campaign --breakdowns age\n${CLI} budget 1234567890 2500     # asks for your approval\n${CLI} tools                      # everything you can run`}
            />
            <p>
              Tip: {code(`alias v4a="${CLI}"`)}. npm blocked? Use{" "}
              {code(`npx -y ${SITE}/cli/viral4all-ads.tgz`)} instead. Exit codes: 0 ok, 1 tool
              error, 2 usage error, 3 not signed in. {code("VIRAL4ALL_API_KEY")} overrides the saved
              sign-in.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks" hidden={!shown(SECTIONS[6])}>
            <p>
              Get told when something happens. Add an https URL on the{" "}
              <Link to="/webhooks" className={A}>
                Webhooks
              </Link>{" "}
              page and pick events. Slack and Discord webhook URLs get a plain message; anything
              else gets signed JSON.
            </p>
            <ul className="space-y-1">
              {WEBHOOK_EVENTS.map((e) => (
                <li key={e.value}>
                  {code(e.value)} {e.description}
                </li>
              ))}
            </ul>
            <CopyBlock
              label="Payload"
              value={`{\n  "id": "6f1c…",\n  "type": "approval.requested",\n  "created_at": "2026-10-22T09:30:00.000Z",\n  "data": { "approval_id": "…", "action": "budget", "headline": "Spring sale: daily budget $20.00 → $25.00", "approve_url": "${SITE}/approve/…" },\n  "text": "Approval needed: Spring sale: daily budget $20.00 → $25.00. Approve or reject: ${SITE}/approve/…"\n}`}
            />
            <p>
              Headers: {code("X-Viral4All-Event")}, {code("X-Viral4All-Delivery")} and{" "}
              {code("X-Viral4All-Signature: t=…,v1=…")}, an HMAC-SHA256 of {code("t.body")} with the
              secret shown when you added the webhook. Check it before trusting a message:
            </p>
            <CopyBlock
              label="Verify (Node.js)"
              value={`import { createHmac, timingSafeEqual } from "node:crypto";\n\nexport function verify(rawBody, header, secret) {\n  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));\n  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // older than 5 minutes\n  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");\n  return v1?.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));\n}`}
            />
            <p>
              Each event is sent once, with a 5-second timeout; any 2xx answer counts. A webhook
              that fails 20 times in a row is paused; resume it on the Webhooks page.
            </p>
          </Section>

          <Section id="plugin" title="Plugin & skills" hidden={!shown(SECTIONS[7])}>
            <p>
              The Claude Code plugin adds the connector plus five ready-made workflows: weekly
              check, what changed, find wasted spend, launch a campaign and safe budget change.
            </p>
            <CopyBlock
              label="Inside Claude Code"
              value={`/plugin marketplace add ${SITE}/claude/marketplace.json\n/plugin install viral4all-ads@viral4all`}
            />
            <p>
              Also on GitHub: {code("/plugin marketplace add black12-ag/viral4all-ads")}. The skills
              work in Claude on the web too: upload them in Settings → Capabilities → Skills (zips
              are in the Claude steps under{" "}
              <a href="#connect" className={A}>
                Connect your AI
              </a>
              ).
            </p>
          </Section>

          <Section id="mcp" title="MCP details" hidden={!shown(SECTIONS[8])}>
            <ul className="space-y-2">
              <li>
                Server: {code(`${SITE}/mcp`)} (Streamable HTTP). Listed in the official MCP Registry
                as {code("com.viral4all.ads/mcp")}.
              </li>
              <li>
                Sign-in: OAuth 2.1 with dynamic client registration and PKCE. Discovery at{" "}
                {code("/.well-known/oauth-authorization-server")}. Scopes: {code("mcp:read")}{" "}
                (reports only) or {code("mcp:write")} (everything, with approvals).
              </li>
              <li>
                Apps without sign-in: send an API key as {code("Authorization: Bearer sk_meta_…")}.
              </li>
              <li>
                AI agents can read{" "}
                <a href="/llms.txt" className={A}>
                  /llms.txt
                </a>{" "}
                to learn how to connect by themselves.
              </li>
            </ul>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting" hidden={!shown(SECTIONS[9])}>
            <Troubleshooting className="text-foreground" />
          </Section>

          <Section id="support" title="Support" hidden={!shown(SECTIONS[10])}>
            <p>
              Email{" "}
              <a href="mailto:support@viral4all.com" className={A}>
                support@viral4all.com
              </a>
              . Include your account email and the approval link or the time it happened; never send
              passwords or API keys. More on{" "}
              <Link to="/support" className={A}>
                Support
              </Link>
              ,{" "}
              <Link to="/privacy" className={A}>
                Privacy
              </Link>{" "}
              and{" "}
              <Link to="/terms" className={A}>
                Terms
              </Link>
              .
            </p>
          </Section>
        </main>
      </div>
      <SiteFooter signedIn={Boolean(user)} />
    </div>
  );
}
