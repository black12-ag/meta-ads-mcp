import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, CreditCard, KeyRound, Minus, Plug, Plus, Timer } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { LandingNav } from "@/components/LandingNav";
import { GravityStory } from "@/components/landing/GravityStory";
import { Reveal } from "@/components/Reveal";
import { LandingShowcase } from "@/components/LandingShowcase";
import { SourceArc } from "@/components/landing/SourceArc";
import { SiteFooter } from "@/components/SiteFooter";
import { CapabilityBento } from "@/components/landing/CapabilityBento";
import { PlayOnView } from "@/components/landing/PlayOnView";
import { SpotlightCard } from "@/components/landing/SpotlightCard";
import { HoloCard } from "@/components/landing/HoloCard";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Viral4All Ads — MCP Server for Ads & Social Management" },
      {
        name: "description",
        content:
          "Connect Meta, Google, TikTok, LinkedIn and X to Claude, ChatGPT or Cursor. Launch campaigns, move budgets and schedule posts through one OAuth-secured MCP endpoint.",
      },
      { property: "og:title", content: "Viral4All Ads — MCP Server for Ads & Social Management" },
      {
        property: "og:description",
        content:
          "One MCP endpoint for every ad and social account. Run campaigns and content from your AI assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const CLIENTS = ["Claude", "ChatGPT", "Cursor", "Claude Code", "n8n", "Any MCP client"];

// Each card's stats are facts about the step, shown like a collectible card's stat line.
const STEPS = [
  {
    title: "Create your account",
    body: "Google or email. Takes a minute.",
    stats: [
      ["Time", "1 min"],
      ["Card", "None"],
    ],
  },
  {
    title: "Connect Meta",
    body: "Pick the ad accounts your AI may use.",
    stats: [
      ["Login", "Facebook"],
      ["Tokens", "Encrypted"],
    ],
  },
  {
    title: "Add the URL to your AI",
    body: "Claude, ChatGPT, Cursor and more.",
    stats: [
      ["URL", "1"],
      ["AI apps", "8+"],
    ],
  },
  {
    title: "Ask for what you want",
    body: "“Pause everything under 1.2 ROAS.”",
    stats: [["Spends without OK", "0"]],
  },
];
// resting tilt and drop per card, so the row reads like cards laid on a table
const TILTS = [-2.5, 1.8, -1.2, 2.4];
const DROPS = ["", "lg:mt-5", "lg:-mt-1", "lg:mt-3"];

const PERKS = [
  { icon: Timer, title: "Two-minute setup" },
  { icon: KeyRound, title: "Keys you can revoke" },
  { icon: Plug, title: "Any MCP client" },
  { icon: CreditCard, title: "No card required" },
];

// Rows we can stand behind today, against a platform's own read-first connector.
const COMPARE = [
  ["Changes", "Read-first, limited writes", "Pause, rebudget, edit, launch"],
  ["Safety", "Not documented", "Approvals, limits and undo"],
  ["Activity log", false, "Every AI change recorded"],
  ["AI apps", "One assistant", "Claude, ChatGPT, Cursor and more"],
  ["Access", "Gated beta", "Any ad account you connect"],
];

const FAQ = [
  {
    q: "What is MCP?",
    a: "The open standard that lets AI apps use real tools. Viral4All Ads is the tool that connects your AI to your ad accounts.",
  },
  {
    q: "Does my AI get my passwords?",
    a: "No. It signs in through us with access you can revoke any time. It never sees your Meta password.",
  },
  {
    q: "Can it change things, or only read?",
    a: "Both. It reads results and can pause, change budgets, edit and launch ads. Anything that spends money waits for your OK.",
  },
  {
    q: "Which AI apps work with it?",
    a: "Any app that speaks MCP: Claude, ChatGPT, Cursor, Claude Code, Gemini and more.",
  },
];

const MCP_POINTS = [
  "Live numbers, not yesterday's export",
  "Access you can revoke any time",
  "Pauses, rebudgets and launches",
  "Sees only the accounts you allow",
];

const CONFIG = `{
  "mcpServers": {
    "viral4all-ads": {
      "url": "https://ads.viral4all.com/mcp"
    }
  }
}`;

const headingClass =
  "text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance";

function Landing() {
  const { user } = useSession();
  const signedIn = Boolean(user);

  return (
    <div className="min-h-screen bg-background font-sora antialiased">
      <LandingNav signedIn={signedIn} />
      <GravityStory signedIn={signedIn} />

      {/* The rest of the page slides up over the (now empty) sphere canvas. No overflow-hidden:
          the source hover cards rise above the first section, so it rounds its own corners. */}
      <div className="relative z-10 rounded-t-[2.5rem] bg-background md:rounded-t-[4rem]">
        <section className="rounded-t-[2.5rem] bg-background md:rounded-t-[4rem]">
          <Reveal className="mx-auto max-w-6xl px-6 py-14 lg:px-16">
            <p className="text-center text-xs text-muted-foreground font-medium">Sources</p>
            <div className="mt-7">
              <SourceArc />
            </div>
            <p className="mt-4 text-center">
              <Link
                to="/sources"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                All sources <ArrowRight className="size-4" />
              </Link>
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PERKS.map((perk) => (
                <SpotlightCard key={perk.title} className="flex items-center gap-3 p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <perk.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="self-center text-sm font-semibold">{perk.title}</span>
                </SpotlightCard>
              ))}
            </div>
          </Reveal>
        </section>

        <section id="platform" className="bg-background">
          <div className="mx-auto grid max-w-6xl items-start gap-12 px-6 py-24 lg:grid-cols-2 lg:px-16">
            <Reveal>
              <h2 className={headingClass}>What MCP changes</h2>
              <ul className="mt-8 grid gap-0 border-t border-border">
                {MCP_POINTS.map((line, i) => (
                  <Reveal
                    as="li"
                    key={line}
                    delay={80 + i * 70}
                    y={10}
                    className="group flex items-start gap-3 border-b border-border py-4 text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-primary transition-transform duration-300 ease-out group-hover:scale-110" />
                    {line}
                  </Reveal>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <SpotlightCard>
                <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                  <span className="size-2 rounded-full bg-primary" />
                  <span className="text-xs text-muted-foreground font-medium">MCP config</span>
                </div>
                <pre className="overflow-x-auto bg-surface-2/50 px-5 py-6 font-mono text-xs leading-relaxed text-foreground/80">
                  <code>{CONFIG}</code>
                </pre>
                {/* the apps light up in turn: the same endpoint serves every one of them */}
                <PlayOnView className="bento flex flex-wrap gap-2 border-t border-border px-5 py-4">
                  {CLIENTS.map((c, i) => (
                    <span
                      key={c}
                      data-anim
                      style={{ animationDelay: `${i * 1.2}s` }}
                      className="v-chip rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                    >
                      {c}
                    </span>
                  ))}
                </PlayOnView>
              </SpotlightCard>
            </Reveal>
          </div>
        </section>

        <section id="how-it-works" className="bg-surface-2/40">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:px-16">
            <Reveal>
              <h2 className={`${headingClass} max-w-2xl`}>
                From sign-up to running ads in two minutes
              </h2>
            </Reveal>
            {/* the steps as collectible cards; the last one gets stamped once it is on screen */}
            <PlayOnView
              as="ol"
              className="bento mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5"
            >
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 80} className={cn("relative", DROPS[i])}>
                  <HoloCard tilt={TILTS[i]} className="h-full">
                    <div className="flex h-full min-h-[300px] flex-col p-5">
                      <div className="flex items-start justify-between">
                        <span className="font-card text-[64px] leading-[0.8] font-extrabold text-brand-light italic">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <LogoMark className="size-7 opacity-80" />
                      </div>
                      <h3 className="mt-7 font-card text-[26px] leading-[0.95] font-extrabold tracking-wide uppercase italic">
                        {s.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-white/70">{s.body}</p>
                      <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 font-card text-[15px] font-bold tracking-wide uppercase">
                        {s.stats.map(([k, v]) => (
                          <span key={k}>
                            {k} <span className="text-brand-light">{v}</span>
                          </span>
                        ))}
                      </p>
                    </div>
                  </HoloCard>
                  {i === STEPS.length - 1 ? (
                    <span
                      data-anim
                      aria-hidden
                      className="stamp pointer-events-none absolute top-[64%] right-2 rounded-lg border-[3px] border-brand-light bg-brand/20 px-3 py-0.5 font-card text-[34px] leading-none font-extrabold tracking-wide text-brand-light uppercase italic shadow-[0_0_24px_hsl(var(--brand)/0.45)] backdrop-blur-[2px]"
                    >
                      Approved
                    </span>
                  ) : null}
                </Reveal>
              ))}
            </PlayOnView>
          </div>
        </section>

        <section id="capabilities" className="bg-background">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:px-16">
            <Reveal>
              <h2 className={`${headingClass} max-w-2xl`}>
                Everything you need to run paid and organic
              </h2>
            </Reveal>
            <CapabilityBento />
            <p className="mt-4 text-xs text-muted-foreground">Examples use sample data.</p>
          </div>
        </section>

        <LandingShowcase />

        <section className="bg-surface-2/40">
          <div className="mx-auto grid max-w-6xl items-start gap-12 px-6 py-24 lg:grid-cols-2 lg:px-16">
            <Reveal>
              <h2 className={headingClass}>Ad ops as a conversation</h2>
            </Reveal>

            <Reveal delay={120}>
              <SpotlightCard className="p-6">
                <p className="text-xs text-muted-foreground font-medium">
                  Claude + Viral4All Ads MCP
                </p>
                <PlayOnView className="bento mt-5 space-y-4 text-sm">
                  <p
                    data-anim
                    style={{ animationDelay: "0.2s" }}
                    className="v-rise ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground"
                  >
                    Find the ad sets wasting spend in Summer Sale and fix the budgets.
                  </p>
                  <div
                    data-anim
                    style={{ animationDelay: "0.9s" }}
                    className="v-rise flex flex-wrap gap-2"
                  >
                    {["meta_get_insights", "meta_list_campaigns"].map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div
                    data-anim
                    style={{ animationDelay: "1.6s" }}
                    className="v-rise rounded-2xl rounded-bl-md border border-border bg-surface-2/60 px-4 py-3 text-muted-foreground"
                  >
                    Two of five ad sets are below break-even:
                    <ul className="mt-3 space-y-1.5 text-foreground/90">
                      <li className="flex justify-between gap-4">
                        <span>Lookalike — Purchasers</span>
                        <span className="text-primary">ROAS 4.8x</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span>Broad — US 18+</span>
                        <span>ROAS 0.7x</span>
                      </li>
                      <li className="flex justify-between gap-4">
                        <span>Interests — Fitness</span>
                        <span>ROAS 0.9x</span>
                      </li>
                    </ul>
                  </div>
                  <div
                    data-anim
                    style={{ animationDelay: "2.5s" }}
                    className="v-rise flex flex-wrap gap-2"
                  >
                    {["meta_pause_ads ×2", "meta_set_budget"].map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p
                    data-anim
                    style={{ animationDelay: "3.2s" }}
                    className="v-rise rounded-2xl rounded-bl-md border border-primary/30 bg-primary/5 px-4 py-3 text-foreground/90"
                  >
                    Paused both. Moving their $86/day into Lookalike — Purchasers needs your OK, so
                    I sent you an approval link.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Illustrative example using sample account data.
                  </p>
                </PlayOnView>
              </SpotlightCard>
            </Reveal>
          </div>
        </section>

        <section id="compare" className="bg-background">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:px-16">
            <Reveal>
              <h2 className={`${headingClass} max-w-2xl`}>
                Why not just use a first-party connector?
              </h2>
            </Reveal>

            {/* phones: one card per row, our answer first, so nothing hides off-screen */}
            <div className="mt-12 space-y-2 md:hidden">
              {COMPARE.map(([label, theirs, ours]) => (
                <div key={String(label)} className="panel p-4 text-sm">
                  <p className="font-semibold">{label}</p>
                  <p className="mt-2 flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {ours}
                  </p>
                  <p className="mt-1 flex items-start gap-2 text-muted-foreground">
                    <Minus className="mt-0.5 size-4 shrink-0" />
                    First-party: {theirs === false ? "Not available" : theirs}
                  </p>
                </div>
              ))}
            </div>
            <Reveal delay={80} className="panel mt-12 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground font-medium">
                    <th className="px-6 py-4 font-medium">What matters</th>
                    <th className="px-6 py-4 font-medium">First-party MCP</th>
                    <th className="bg-primary/5 px-6 py-4 font-semibold text-primary">
                      Viral4All Ads
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map(([label, theirs, ours]) => (
                    <tr
                      key={String(label)}
                      className="border-b border-border/60 transition-colors duration-200 last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-6 py-4 font-medium">{label}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {theirs === false ? (
                          <span className="flex items-center gap-2">
                            <Minus className="size-4" /> Not available
                          </span>
                        ) : (
                          theirs
                        )}
                      </td>
                      <td className="bg-primary/5 px-6 py-4 text-foreground/90">
                        <span className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          {ours}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        <section id="faq" className="bg-surface-2/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[1fr_1.6fr] lg:px-16">
            <Reveal>
              <h2 className={headingClass}>Questions, answered</h2>
            </Reveal>
            <div className="border-t border-border">
              {FAQ.map((f, i) => (
                <Reveal as="div" key={f.q} delay={i * 60} y={10}>
                  <details className="group border-b border-border py-6 transition-colors duration-300 hover:border-primary/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-semibold transition-colors duration-300 group-hover:text-primary [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <Plus className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out group-open:rotate-45" />
                    </summary>
                    <p className="mt-3 max-w-2xl animate-fade-in text-sm leading-relaxed text-muted-foreground">
                      {f.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep px-6 py-20 text-center text-white lg:px-16">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-white/15 blur-3xl"
            />
            <Reveal as="h2" className={`${headingClass} relative mx-auto max-w-3xl`}>
              Ready to run your ads with AI?
            </Reveal>
            <Reveal delay={80} className="relative mt-9 flex flex-wrap justify-center gap-3">
              <Link
                to={signedIn ? "/dashboard" : "/auth"}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-brand-deep transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgb(0_0_0/0.5)] active:translate-y-0 active:scale-[0.98]"
              >
                {signedIn ? "Open console" : "Start free"}
                <ArrowRight className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition-[transform,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0 active:scale-[0.98]"
              >
                See how it works
              </a>
            </Reveal>
          </div>
        </section>
      </div>

      <SiteFooter signedIn={signedIn} />
    </div>
  );
}
