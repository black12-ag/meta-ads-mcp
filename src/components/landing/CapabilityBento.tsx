import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarClock,
  PenLine,
  Target,
  type LucideIcon,
} from "lucide-react";
import { PLATFORM_MARKS } from "@/lib/platform-marks";
import { PlayOnView } from "@/components/landing/PlayOnView";
import { SpotlightCard } from "@/components/landing/SpotlightCard";
import { Reveal } from "@/components/Reveal";
import { cn } from "@/lib/utils";

const MARK = Object.fromEntries(PLATFORM_MARKS.map((m) => [m.id, m.icon]));

// Every vignette below is illustrative sample data, drawn in the product's own UI language.

function Chip({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] shadow-[0_1px_2px_hsl(var(--shadow)/0.06)]">
      <span className="font-mono tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
      {delta ? (
        <span className="inline-flex items-center font-semibold text-success">
          <ArrowUpRight className="size-3" />
          {delta}
        </span>
      ) : null}
    </span>
  );
}

const LINE = "M0 112 C45 106 60 84 105 86 S180 60 225 70 S300 36 345 44 S435 16 476 22";
const PREV = "M0 122 C60 120 90 106 150 108 S255 90 315 96 S420 74 476 80";

function Analysis() {
  return (
    <div className="absolute inset-0 flex flex-col p-4 pr-5">
      <div className="flex flex-wrap gap-1.5">
        <Chip label="ROAS" value="4.8x" delta="12%" />
        <Chip label="Spend" value="$1,240" />
        <Chip label="CTR" value="2.9%" />
      </div>
      {/* an svg won't grow as a flex item, so a box takes the space and the chart fills it */}
      <div className="relative mt-3 min-h-[118px] flex-1">
        <svg
          viewBox="0 0 480 140"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id="bento-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="hsl(var(--chart-1))" stopOpacity="0.28" />
              <stop offset="1" stopColor="hsl(var(--chart-1))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[35, 70, 105].map((y) => (
            <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="hsl(var(--border))" />
          ))}
          <path
            d={PREV}
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <path
            data-anim
            d={`${LINE} L476 140 L0 140 Z`}
            fill="url(#bento-area)"
            className="v-fade"
          />
          <path
            data-anim
            d={LINE}
            pathLength={1}
            fill="none"
            stroke="hsl(var(--chart-1))"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="v-draw"
          />
          <circle
            data-anim
            cx="476"
            cy="22"
            r="4.5"
            fill="hsl(var(--chart-1))"
            className="v-ping"
          />
          <circle cx="476" cy="22" r="4.5" fill="hsl(var(--chart-1))" />
        </svg>
      </div>
    </div>
  );
}

function BudgetRow({ name, roas, bar }: { name: string; roas: string; bar: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[12px]">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{roas}</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div data-anim className={cn("h-full origin-left rounded-full", bar)} />
      </div>
    </div>
  );
}

function Budget() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-[22px] px-5">
      <BudgetRow name="Broad — US 18+" roas="0.7x" bar="v-bar-a bg-muted-foreground/40" />
      <BudgetRow name="Lookalike — Buyers" roas="4.8x" bar="v-bar-b bg-primary" />
      <span
        data-anim
        style={{ "--move": "62px" } as CSSProperties}
        className="v-move absolute top-[calc(50%-53px)] right-5 rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary))]"
      >
        $86/day
      </span>
    </div>
  );
}

const POSTS = [
  { mark: "meta", title: "Campaign · Summer drop", when: "Tue 09:00" },
  { mark: "meta", title: "Ad set · Lookalike buyers", when: "Tue 13:30" },
  { mark: "meta", title: "Carousel ad · 3 looks", when: "Wed 18:00" },
  { mark: "meta", title: "Campaign · Back in stock", when: "Thu 10:00" },
];

function Queue() {
  return (
    <div className="absolute inset-0 overflow-hidden px-4 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
      {/* two copies, every row with the same bottom margin, so -50% lands exactly on the loop */}
      <div data-anim className="v-ticker pt-3">
        {[...POSTS, ...POSTS].map((p, i) => {
          const Icon = MARK[p.mark];
          return (
            <div
              key={i}
              className="mb-2 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 shadow-[0_1px_2px_hsl(var(--shadow)/0.06)]"
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate text-[12px] font-medium">{p.title}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                {p.when}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SEGMENTS = [
  { x: 68, y: 26, good: true },
  { x: 30, y: 38, good: true },
  { x: 58, y: 70, good: false },
  { x: 22, y: 64 },
  { x: 80, y: 56 },
];

function Audience() {
  return (
    <div className="absolute inset-0">
      <div className="absolute top-1/2 left-1/2 size-[164px] -translate-x-1/2 -translate-y-1/2">
        {[100, 66, 33].map((s) => (
          <span
            key={s}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border"
            style={{ width: `${s}%`, height: `${s}%` }}
          />
        ))}
        <span
          data-anim
          className="v-spin absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,hsl(var(--primary)/0.32),transparent_24%)]"
        />
        {SEGMENTS.map((d, i) => (
          <span
            key={i}
            className={cn(
              "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
              d.good === true && "bg-success ring-4 ring-success/20",
              d.good === false && "bg-destructive ring-4 ring-destructive/20",
              d.good === undefined && "bg-muted-foreground/50",
            )}
            style={{ left: `${d.x}%`, top: `${d.y}%` }}
          />
        ))}
      </div>
      <span className="absolute top-4 right-4 rounded-md bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
        Women 25–34 · $8 CPA
      </span>
      <span className="absolute bottom-4 left-4 rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
        Broad 18+ · $41 CPA
      </span>
    </div>
  );
}

const ACCOUNTS = [
  { initials: "NC", name: "Nile Coffee Co.", id: "4821", spend: "$1,240" },
  { initials: "SB", name: "Sunrise Bakery", id: "7310", spend: "$412" },
  { initials: "NF", name: "Nova Fitness", id: "0957", spend: "$2,980" },
];

function Accounts() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-4">
      <div className="relative">
        <span
          data-anim
          className="v-select absolute inset-x-0 top-0 h-11 rounded-xl border border-primary/30 bg-primary/10"
        />
        {ACCOUNTS.map((a) => (
          <div key={a.id} className="relative flex h-11 items-center gap-2.5 px-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface font-mono text-[10px] font-bold text-primary ring-1 ring-border">
              {a.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] leading-4 font-semibold">{a.name}</span>
              <span className="block font-mono text-[10px] leading-4 text-muted-foreground">
                act_••{a.id}
              </span>
            </span>
            <span className="ml-auto font-mono text-[11px] text-foreground/80 tabular-nums">
              {a.spend}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Real tool names. Pauses run at once; budget changes wait for approval; copies start paused.
const LOG = [
  { tool: "meta_pause_ads", target: "Broad — US 18+", result: "Paused", wait: false },
  {
    tool: "meta_set_budget",
    target: "Lookalike · $40 → $86/day",
    result: "Waiting for your OK",
    wait: true,
  },
  {
    tool: "meta_duplicate",
    target: "Summer Sale → Retargeting",
    result: "Copied, starts paused",
    wait: false,
  },
];

function Writes() {
  return (
    <div
      data-anim
      className="v-cycle absolute inset-0 flex flex-col justify-center gap-2 p-4 font-mono text-[12px] sm:p-6"
    >
      <p className="mb-1 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        Claude · tool calls
      </p>
      {LOG.map((l, i) => (
        <div
          key={l.tool}
          data-anim
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-3 py-2 shadow-[0_1px_2px_hsl(var(--shadow)/0.06)]",
            `v-type-${i + 1}`,
          )}
        >
          <span className="text-primary">›</span>
          <span className="font-semibold text-foreground">{l.tool}</span>
          <span className="truncate text-muted-foreground">{l.target}</span>
          <span
            className={cn(
              "ml-auto rounded-md px-2 py-0.5 font-sans text-[11px] font-medium",
              l.wait ? "bg-primary/10 text-primary" : "bg-success/10 text-success",
            )}
          >
            {l.result}
          </span>
        </div>
      ))}
    </div>
  );
}

function BentoCard({
  icon: Icon,
  title,
  body,
  wide,
  className,
  delay,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  wide?: boolean;
  className?: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <SpotlightCard className={cn("flex h-full flex-col p-2", wide && "lg:flex-row")}>
        <div
          aria-hidden
          className={cn(
            "relative h-52 overflow-hidden rounded-lg border border-border/70 bg-surface-2/60",
            wide && "lg:order-2 lg:h-auto lg:min-h-60 lg:flex-1",
          )}
        >
          {/* dot grid, fading downward: the "canvas" each vignette sits on */}
          <span className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)] [background-image:radial-gradient(hsl(var(--foreground)/0.08)_1px,transparent_1px)] [background-size:14px_14px]" />
          {children}
        </div>
        <div
          className={cn("p-5", wide && "lg:flex lg:w-[38%] lg:flex-col lg:justify-center lg:p-8")}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <Icon className="size-4" />
            </span>
            <h3 className="text-base font-bold tracking-tight">{title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </SpotlightCard>
    </Reveal>
  );
}

/** Capabilities as a bento grid; each card shows a small, live piece of the product doing the job. */
export function CapabilityBento() {
  return (
    <PlayOnView className="bento mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <BentoCard
        wide
        delay={0}
        className="md:col-span-2"
        icon={BarChart3}
        title="Campaign analysis"
        body="Live spend and ROAS, straight from your accounts."
      >
        <Analysis />
      </BentoCard>
      <BentoCard
        delay={70}
        icon={ArrowRightLeft}
        title="Budget reallocation"
        body="Moves spend to what's earning."
      >
        <Budget />
      </BentoCard>
      <BentoCard
        delay={0}
        icon={CalendarClock}
        title="Launch queue"
        body="New ads wait, paused, until you approve them."
      >
        <Queue />
      </BentoCard>
      <BentoCard
        delay={70}
        icon={Target}
        title="Audience targeting"
        body="See who converts and who drains budget."
      >
        <Audience />
      </BentoCard>
      <BentoCard
        delay={140}
        icon={Building2}
        title="Multi-account management"
        body="Every client account in one conversation."
      >
        <Accounts />
      </BentoCard>
      <BentoCard
        wide
        delay={0}
        className="md:col-span-2 lg:col-span-3"
        icon={PenLine}
        title="Writes, not just reads"
        body="Real changes through real tool calls."
      >
        <Writes />
      </BentoCard>
    </PlayOnView>
  );
}
