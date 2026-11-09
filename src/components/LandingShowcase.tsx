import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { Building2, Check, TrendingUp, User } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SpotlightCard } from "@/components/landing/SpotlightCard";
import { HoloCard } from "@/components/landing/HoloCard";
import { PLATFORM_MARKS } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";
import opsRoom from "@/assets/ops-room.jpg";
import mcpLayer from "@/assets/mcp-layer.jpg";

const heading =
  "text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance";

// The photos were shot for the old green brand; this turns their glow violet.
const VIOLET = "[filter:hue-rotate(150deg)_saturate(1.1)]";
const GLASS = "rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white backdrop-blur-md";
const MARK = Object.fromEntries(PLATFORM_MARKS.map((m) => [m.id, m.icon]));
const CYCLE_MS = 4200;

// What each audience looks like in practice, shown over the photo while its card is active.
const AgencyScene = (
  <div className={GLASS}>
    <div className="flex items-center gap-3">
      <span className="flex -space-x-2">
        {["NC", "SB", "NF"].map((i) => (
          <span
            key={i}
            className="grid size-7 place-items-center rounded-full bg-brand font-mono text-[10px] font-bold ring-2 ring-ink"
          >
            {i}
          </span>
        ))}
        <span className="grid size-7 place-items-center rounded-full bg-white/20 font-mono text-[10px] font-bold ring-2 ring-ink">
          +9
        </span>
      </span>
      <span className="text-sm font-semibold">12 accounts · 1 conversation</span>
    </div>
  </div>
);
const InHouseScene = (
  <div className={cn(GLASS, "space-y-1.5 text-[13px]")}>
    {[
      { mark: "meta", text: "Summer Sale · campaign", when: "Tue 09:00" },
      { mark: "instagram", text: "Launch reel · post", when: "Tue 09:00" },
    ].map((r) => {
      const Icon = MARK[r.mark];
      return (
        <p key={r.text} className="flex items-center gap-2.5">
          <Icon className="size-4" />
          <span className="font-medium">{r.text}</span>
          <span className="ml-auto pl-4 font-mono text-[11px] text-white/70">{r.when}</span>
        </p>
      );
    })}
  </div>
);
const SoloScene = (
  <div className={cn(GLASS, "flex items-center gap-2 text-[13px] font-semibold")}>
    {["Ask", "Review", "Approve"].map((step, i) => (
      <span key={step} className="flex items-center gap-2">
        {i > 0 ? <span className="h-px w-5 bg-white/40" /> : null}
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full",
            i === 2 ? "bg-success text-white" : "bg-white/20",
          )}
        >
          {i === 2 ? (
            <Check className="size-3" />
          ) : (
            <span className="size-1.5 rounded-full bg-white" />
          )}
        </span>
        {step}
      </span>
    ))}
  </div>
);

const AUDIENCE = [
  {
    icon: Building2,
    title: "Performance agencies",
    body: "Twelve accounts, one conversation.",
    scene: AgencyScene,
  },
  {
    icon: TrendingUp,
    title: "In-house growth teams",
    body: "Campaigns and posts ship together.",
    scene: InHouseScene,
  },
  {
    icon: User,
    title: "Solo operators",
    body: "A media team without the headcount.",
    scene: SoloScene,
  },
];

/** The three audiences take turns; the photo shows what the active one's day looks like. */
function WhoRunsIt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const cycling = inView && !held && !reduced;

  useEffect(() => {
    if (!cycling) return;
    const id = setInterval(() => setActive((a) => (a + 1) % AUDIENCE.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [cycling, active]);

  return (
    <div
      ref={ref}
      data-play={inView}
      className="bento mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[1.1fr_1fr] lg:px-16"
    >
      <Reveal className="relative overflow-hidden rounded-xl border border-border bg-ink">
        <img
          data-anim
          src={opsRoom}
          alt="Media buyer's dark workspace with campaign performance charts on two monitors"
          width={1280}
          height={864}
          loading="lazy"
          className={`v-kenburns h-full w-full object-cover ${VIOLET}`}
        />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
        <div aria-hidden className="absolute inset-x-5 bottom-5 grid">
          {AUDIENCE.map((a, i) => (
            <div
              key={a.title}
              className={cn(
                "col-start-1 row-start-1 self-end justify-self-start transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                i === active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
              )}
            >
              {a.scene}
            </div>
          ))}
        </div>
      </Reveal>

      <div>
        <Reveal>
          <h2 className={heading}>Who runs it</h2>
        </Reveal>
        <div className="mt-10 grid gap-3" onMouseLeave={() => setHeld(false)}>
          {AUDIENCE.map((a, i) => {
            const on = i === active;
            return (
              <Reveal key={a.title} delay={80 + i * 70} y={10}>
                <SpotlightCard
                  onMouseEnter={() => {
                    setActive(i);
                    setHeld(true);
                  }}
                  className={cn(
                    "flex gap-4 p-5 transition-[border-color,background-color,box-shadow] duration-300",
                    on && "border-primary/35 bg-primary/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition-colors duration-300",
                      on
                        ? "bg-primary text-primary-foreground ring-primary"
                        : "bg-primary/10 text-primary ring-primary/15",
                    )}
                  >
                    <a.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <h3 className="text-base font-bold tracking-tight">{a.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                  </span>
                  {/* time until the next audience; restarts on every change */}
                  {on && cycling ? (
                    <span
                      key={active}
                      aria-hidden
                      className="absolute inset-x-5 bottom-0 h-0.5 origin-left rounded-full bg-primary"
                      style={{ animation: `v-progress ${CYCLE_MS}ms linear forwards` }}
                    />
                  ) : null}
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Collectible cards like the How-it-works steps; "Paused" gets stamped when it comes into view.
const CONTROLS: {
  stat: string;
  title: string;
  body: string;
  tilt: number;
  stamp?: string;
  demo: ReactNode;
}[] = [
  {
    stat: "OAuth",
    title: "No keys to paste",
    body: "Sign in once. Revoke any time.",
    tilt: -1.6,
    demo: (
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-white/80">
          Your AI
        </span>
        <span className="relative h-px flex-1 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.25)_0_5px,transparent_5px_9px)]">
          {[0, 0.8, 1.6].map((d) => (
            <span
              key={d}
              data-anim
              className="v-flow absolute inset-0"
              style={{ animationDelay: `${d}s` }}
            >
              <span className="absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-brand-light shadow-[0_0_8px_hsl(var(--brand-light))]" />
            </span>
          ))}
        </span>
        <span className="rounded-md border border-brand-light/40 bg-brand/20 px-2 py-1 text-brand-light">
          Viral4All
        </span>
      </div>
    ),
  },
  {
    stat: "Paused",
    title: "Safe by default",
    body: "New campaigns start paused.",
    tilt: 1.8,
    stamp: "Paused",
    demo: (
      <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 font-card text-[15px] font-bold tracking-wide uppercase">
        <span>
          Spend <span className="text-brand-light">$0.00</span>
        </span>
        <span>
          Until <span className="text-brand-light">You say so</span>
        </span>
      </p>
    ),
  },
];

export function LandingShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  return (
    <>
      <section className="bg-background">
        <WhoRunsIt />
      </section>

      <section id="control" className="bg-surface-2/40">
        <div ref={ref} data-play={inView} className="bento mx-auto max-w-6xl px-6 py-24 lg:px-16">
          <Reveal>
            <h2 className={`${heading} max-w-2xl`}>Control stays with you</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <Reveal className="relative col-span-1 overflow-hidden rounded-xl bg-ink md:col-span-2 md:row-span-2">
              <img
                data-anim
                src={mcpLayer}
                alt="Layered glass panels lit with violet light, representing scoped access layers"
                width={1280}
                height={960}
                loading="lazy"
                className={`v-kenburns h-full min-h-[260px] w-full object-cover opacity-75 ${VIOLET}`}
              />
              {/* a slow band of light passing over the layers */}
              <span
                data-anim
                aria-hidden
                className="v-scan pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-transparent via-brand-light/15 to-transparent"
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink via-ink/60 to-transparent p-8 text-white">
                <h3 className="text-xl font-bold tracking-tight">Scoped, revocable, isolated</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
                  Your AI only sees the accounts you allow.
                </p>
              </div>
            </Reveal>

            {CONTROLS.map((c, i) => (
              <Reveal key={c.title} delay={80 + i * 70} className="relative">
                <HoloCard tilt={c.tilt} className="h-full">
                  <div className="flex h-full flex-col p-6">
                    <p className="font-card text-[44px] leading-none font-extrabold text-brand-light italic">
                      {c.stat}
                    </p>
                    <h3 className="mt-4 font-card text-2xl leading-none font-extrabold tracking-wide uppercase italic">
                      {c.title}
                    </h3>
                    <p className="mt-2 text-sm text-white/70">{c.body}</p>
                    <div aria-hidden className="mt-auto pt-5">
                      {c.demo}
                    </div>
                  </div>
                </HoloCard>
                {c.stamp ? (
                  <span
                    data-anim
                    aria-hidden
                    className="stamp pointer-events-none absolute top-5 right-5 rounded-lg border-[3px] border-brand-light bg-brand/20 px-3 py-0.5 font-card text-[30px] leading-none font-extrabold tracking-wide text-brand-light uppercase italic shadow-[0_0_24px_hsl(var(--brand)/0.45)] backdrop-blur-[2px]"
                  >
                    {c.stamp}
                  </span>
                ) : null}
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
