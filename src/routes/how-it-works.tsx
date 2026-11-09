import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ShieldCheck, Terminal, Workflow, Zap } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { LandingNav } from "@/components/LandingNav";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Viral4All Ads works — MCP for Meta Ads, step by step" },
      {
        name: "description",
        content:
          "The full walkthrough: sign up, connect Meta Ads with OAuth, point Claude or ChatGPT at one MCP endpoint, and run campaigns by conversation. Every step, and why it exists.",
      },
      { property: "og:title", content: "How Viral4All Ads works — step by step" },
      {
        property: "og:description",
        content:
          "From sign-up to a live ad changed by an AI assistant: the logic, the guardrails and the manual.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

const CHAPTERS = [
  { id: "overview", label: "The idea" },
  { id: "flow", label: "The logic" },
  { id: "steps", label: "Step by step" },
  { id: "assistant", label: "Talking to it" },
  { id: "safety", label: "Guardrails" },
  { id: "manual", label: "Operating manual" },
];

const STEPS = [
  {
    n: "01",
    title: "Create your account",
    what: "Sign up with Google or email. A workspace is created and every table is row-level scoped to your user.",
    why: "Ad data is money data. Each workspace is kept apart in the database itself, so a bug in a page can't leak someone else's spend.",
    where: "/auth",
  },
  {
    n: "02",
    title: "Connect Meta Ads with OAuth",
    what: "Connections → Connect Meta. Meta's consent screen asks for ads_management, ads_read, business_management and Page access. You come back with your ad accounts and Pages listed.",
    why: "You never paste a token. We exchange it on the server, store it encrypted and refresh it for you.",
    where: "/connections",
  },
  {
    n: "03",
    title: "Activate one ad account and one Page",
    what: "Pick the account you want to operate on and the Facebook Page ads will be published from.",
    why: "Dashboards, API keys and AI tools all act on the active account. One switch changes everything.",
    where: "/connections",
  },
  {
    n: "04",
    title: "Watch the console fill with real numbers",
    what: "Overview, Analytics and Meta Ads pull live spend, impressions, reach, clicks and results from the Graph API, plus the last sync time.",
    why: "Numbers come straight from Meta. If one looks wrong here, it's wrong in Meta too.",
    where: "/dashboard",
  },
  {
    n: "05",
    title: "Build or edit an ad",
    what: "Create a campaign, ad set and ad in one wizard. Upload an image or video and the checklist validates dimensions, format, aspect ratio and duration before Meta ever sees it.",
    why: "Meta rejects creatives after upload with vague errors. Validating locally turns a 20-minute round trip into an instant red line.",
    where: "/campaigns",
  },
  {
    n: "06",
    title: "Point your AI assistant at the MCP endpoint",
    what: (
      <>
        Paste https://ads.viral4all.com/mcp into Claude, ChatGPT, Gemini, Codex or Cursor and sign
        in when it asks, choosing read-only or read-and-change. The assistant then sees your tools.
        No API key needed: keys are for scripts and automations. Steps for each app are on{" "}
        <Link to="/connect" className="text-primary hover:underline">
          Connect AI
        </Link>
        .
      </>
    ),
    why: "MCP is the open standard for giving an AI real tools. Your AI calls the same logged functions the dashboard uses.",
    where: "/connect",
  },
  {
    n: "07",
    title: "Or drive it with an API key",
    what: "Create a key with only the permissions you need, then call the REST API from a script or n8n.",
    why: "Scopes mean a key used by a scheduling script can never spend money it wasn't allowed to spend.",
    where: "/api-keys",
  },
  {
    n: "08",
    title: "Keep it in sync and audited",
    what: "Webhooks push Meta changes back in near real time; a backoff queue retries transient failures; every key action lands in the audit log.",
    why: "Automation without a paper trail is a liability. You can always answer 'who paused this ad, and when'.",
    where: "/audit",
  },
];

const FLOW = [
  { label: "You / your assistant", note: "Chat, dashboard, or API call" },
  { label: "Viral4All Ads MCP + REST", note: "Auth, scopes, validation, audit" },
  { label: "Meta Graph API v24", note: "Campaigns, ad sets, ads, creatives" },
  { label: "Sync + webhooks", note: "Results flow back into the console" },
];

const PROMPTS = [
  "Pause every ad under 1.2 ROAS and move that budget to Retargeting.",
  "What did we spend yesterday, and which creative had the best cost per result?",
  "Swap the video on the Summer Sale ad for this URL and resume it.",
  "Raise the daily budget on the top ad set by 20% but cap it at $200.",
];

const SAFETY = [
  {
    t: "Server-side tokens",
    d: "Meta access tokens never reach the browser; the app holds them server-side.",
  },
  {
    t: "Scoped API keys",
    d: "Each key carries an explicit permission set and can be revoked instantly.",
  },
  { t: "Per-user queries", d: "Every database query is filtered by your user id on the server." },
  {
    t: "Full audit log",
    d: "Every create, pause, resume and upload, with its result and time.",
  },
  {
    t: "Validation before spend",
    d: "Creatives and budgets are checked before a single request reaches Meta.",
  },
  {
    t: "Retry with backoff",
    d: "Rate limits and permission blips recover on their own instead of silently dropping.",
  },
];

function HowItWorks() {
  const { user } = useSession();
  const signedIn = Boolean(user);
  const [active, setActive] = useState(CHAPTERS[0].id);

  useEffect(() => {
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav signedIn={signedIn} />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border px-6 pt-36 pb-20 lg:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-6xl">
          <Reveal delay={70}>
            <h1 className="max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
              How it works
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Every step from sign-up to your AI's first change.
            </p>
          </Reveal>
          <Reveal delay={210}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to={signedIn ? "/dashboard" : "/auth"}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-[transform,box-shadow,filter] duration-300 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_40px_-14px_hsl(var(--primary))] active:translate-y-0"
              >
                {signedIn ? "Open the console" : "Start free"}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#steps"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm transition-colors duration-300 hover:border-primary/60 hover:text-primary bg-surface"
              >
                Jump to the steps
              </a>
            </div>
          </Reveal>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[200px_1fr] lg:px-16">
        {/* Sticky chapter rail */}
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-1" aria-label="Chapters">
            {CHAPTERS.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                className={cn(
                  "block border-l-2 py-1.5 pl-3 text-[13px] transition-colors duration-300",
                  active === c.id
                    ? "border-primary text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {c.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-24">
          {/* Overview */}
          <section id="overview" className="scroll-mt-28">
            <SectionTitle title="One endpoint between your accounts and your assistant" />
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Zap,
                  t: "You connect once",
                  d: "OAuth to Meta Ads. Accounts, Pages and permissions land in the console.",
                },
                {
                  icon: Terminal,
                  t: "We expose tools",
                  d: "Every action the UI can take is also an MCP tool and a REST endpoint.",
                },
                {
                  icon: ShieldCheck,
                  t: "You stay in control",
                  d: "Scopes, validation and an audit trail sit between intent and spend.",
                },
              ].map((c, i) => (
                <Reveal key={c.t} delay={i * 70}>
                  <div className="panel group h-full p-5 transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_50px_-30px_hsl(var(--primary))]">
                    <c.icon className="size-4 text-primary" />
                    <h3 className="mt-4 text-sm font-semibold">{c.t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* Flow */}
          <section id="flow" className="scroll-mt-28">
            <SectionTitle title="What happens between “pause that ad” and the ad pausing" />
            <ol className="mt-8 space-y-3">
              {FLOW.map((f, i) => (
                <Reveal key={f.label} delay={i * 70}>
                  <li className="panel flex items-center gap-4 p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 font-mono text-xs text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.note}</p>
                    </div>
                    {i < FLOW.length - 1 ? (
                      <ArrowRight className="ml-auto hidden size-4 shrink-0 rotate-90 text-muted-foreground/50 sm:block" />
                    ) : null}
                  </li>
                </Reveal>
              ))}
            </ol>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The loop closes: results come back through scheduled sync and Meta webhooks, so the
              next question your assistant asks is answered with numbers that are minutes old, not
              days old.
            </p>
          </section>

          {/* Steps */}
          <section id="steps" className="scroll-mt-28">
            <SectionTitle title="Eight steps, and why each one exists" />
            <div className="mt-8 space-y-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={Math.min(i, 4) * 60}>
                  <article className="panel group grid gap-5 p-6 transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_60px_-40px_hsl(var(--primary))] sm:grid-cols-[64px_1fr]">
                    <span className="font-mono text-2xl text-primary/70 transition-colors duration-300 group-hover:text-primary">
                      {s.n}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold">{s.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.what}</p>
                      <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground/90">
                        <span className="font-medium text-foreground">Why: </span>
                        {s.why}
                      </p>
                      <p className="mt-3 font-mono text-[11px] tracking-wide text-muted-foreground/70">
                        {s.where}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </section>

          {/* Assistant */}
          <section id="assistant" className="scroll-mt-28">
            <SectionTitle title="What people ask on day one" />
            <div className="mt-8 space-y-3">
              {PROMPTS.map((p, i) => (
                <Reveal key={p} delay={i * 60}>
                  <div className="panel flex items-start gap-3 p-4 transition-colors duration-300 hover:border-primary/40">
                    <span className="mt-0.5 font-mono text-xs text-primary">›</span>
                    <p className="text-sm leading-relaxed ">{p}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <pre className="panel mt-6 overflow-x-auto p-5 font-mono text-xs leading-relaxed text-muted-foreground">
                {`{
  "mcpServers": {
    "viral4all-ads": { "url": "https://ads.viral4all.com/mcp" }
  }
}`}
              </pre>
            </Reveal>
            <p className="mt-4 text-sm text-muted-foreground">
              Steps for Claude, ChatGPT, Gemini, Codex, Cursor and more are on the{" "}
              <Link to="/connect" className="text-primary hover:underline">
                Connect AI
              </Link>{" "}
              page.
            </p>
          </section>

          {/* Safety */}
          <section id="safety" className="scroll-mt-28">
            <SectionTitle title="What stands between an AI and your budget" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {SAFETY.map((s, i) => (
                <Reveal key={s.t} delay={(i % 2) * 60}>
                  <div className="panel h-full p-5 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40">
                    <div className="flex items-center gap-2">
                      <Check className="size-3.5 text-primary" />
                      <h3 className="text-sm font-semibold">{s.t}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* Manual CTA */}
          <section id="manual" className="scroll-mt-28">
            <SectionTitle title="The detailed version lives inside the console" />
            <Reveal>
              <div className="panel mt-8 flex flex-col gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-lg">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Signed in, the Guide shows these steps for your own account, with what's done
                    ticked off.
                  </p>
                </div>
                <Link
                  to={signedIn ? "/manual" : "/auth"}
                  className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-[transform,box-shadow,filter] duration-300 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_40px_-14px_hsl(var(--primary))]"
                >
                  {signedIn ? "Open the manual" : "Create an account"}
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </Reveal>
          </section>
        </div>
      </div>

      <SiteFooter signedIn={signedIn} />
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Reveal>
      <div>
        <h2 className="max-w-2xl text-2xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-3xl">
          {title}
        </h2>
      </div>
    </Reveal>
  );
}
