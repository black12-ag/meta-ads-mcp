import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { SourceStatus } from "@/components/SourceStatus";
import { PLATFORM_MARKS, markById, type MarkId } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";

// Three laps of the sources around the ring, so the arc is always full.
const CARDS = [...PLATFORM_MARKS, ...PLATFORM_MARKS, ...PLATFORM_MARKS];
const STEP = 360 / CARDS.length;
const SPEED = 5; // degrees per second
const FADE_FROM = 46; // degrees off centre where cards start to fade
const GONE_AT = 62;

/** Card angle around the ring for a given rotation, wrapped to -180..180. */
export function arcAngle(index: number, offset: number) {
  return ((((index * STEP - offset) % 360) + 540) % 360) - 180;
}

/**
 * Sources on the inside of a slowly turning cylinder: the camera sits on its axis, so cards near
 * the edges come closer and look bigger than the one in the middle. The panel underneath
 * describes the card you hover, or the one in the middle.
 */
export function SourceArc() {
  const stage = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLAnchorElement | null)[]>([]);
  const nudge = useRef<(dir: number) => void>(() => {});
  const hovered = useRef<MarkId | null>(null);
  const [active, setActive] = useState<MarkId>(PLATFORM_MARKS[0].id);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let offset = 0;
    let target = 0;
    let raf = 0;
    let last = 0;
    let holding = false;
    let onScreen = true;
    let centred = -1;

    const place = () => {
      const R = Math.min(620, Math.max(340, el.clientWidth * 0.5));
      el.style.perspective = `${R}px`; // camera on the cylinder's axis
      for (let i = 0; i < CARDS.length; i++) {
        const node = nodes.current[i];
        if (!node) continue;
        const a = arcAngle(i, offset);
        const abs = Math.abs(a);
        const rad = (a * Math.PI) / 180;
        const fade =
          abs >= GONE_AT ? 0 : abs > FADE_FROM ? 1 - (abs - FADE_FROM) / (GONE_AT - FADE_FROM) : 1;
        node.style.transform = `translate3d(${R * Math.sin(rad)}px,0,${R * (1 - Math.cos(rad))}px) rotateY(${-a}deg)`;
        node.style.opacity = String(fade);
        node.style.visibility = fade === 0 ? "hidden" : "visible";
        if (abs < STEP / 2 && centred !== i) {
          centred = i;
          if (!hovered.current) setActive(CARDS[i].id);
        }
      }
    };

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!holding && !reduced) target += SPEED * dt;
      offset += (target - offset) * Math.min(1, dt * 7);
      place();
      raf = onScreen && !document.hidden ? requestAnimationFrame(frame) : 0;
    };
    const start = () => {
      if (!raf && onScreen && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    nudge.current = (dir) => {
      target = Math.round(target / STEP) * STEP + dir * STEP;
      start();
    };
    const hold = () => (holding = true);
    const release = () => {
      holding = false;
      hovered.current = null;
    };
    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", release);
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      start();
    });
    io.observe(el);
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);
    const onResize = () => place();
    addEventListener("resize", onResize);

    place();
    start();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerleave", release);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("resize", onResize);
    };
  }, []);

  const mark = markById(active)!;
  const Icon = mark.icon;

  return (
    <div>
      <div
        ref={stage}
        className="relative h-[230px] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] sm:h-[270px]"
      >
        <div className="absolute top-1/2 left-1/2 [transform-style:preserve-3d]">
          {CARDS.map((m, i) => {
            const copy = i >= PLATFORM_MARKS.length; // later laps repeat the first, for looks only
            const live = m.status === "live";
            return (
              <Link
                key={i}
                ref={(n) => {
                  nodes.current[i] = n;
                }}
                to="/sources/$id"
                params={{ id: m.id }}
                aria-hidden={copy || undefined}
                tabIndex={copy ? -1 : undefined}
                onPointerEnter={() => {
                  hovered.current = m.id;
                  setActive(m.id);
                }}
                className={cn(
                  "absolute -mt-[90px] -ml-[65px] flex h-[180px] w-[130px] flex-col items-center justify-center gap-3 rounded-xl border p-3 text-center [backface-visibility:hidden] will-change-transform sm:-mt-[110px] sm:-ml-[80px] sm:h-[220px] sm:w-[160px]",
                  live
                    ? "border-brand-light/40 bg-gradient-to-b from-brand to-brand-deep text-white"
                    : "border-border bg-surface text-foreground",
                )}
              >
                <m.icon className={cn("size-10 sm:size-12", !live && "text-muted-foreground")} />
                <span className="text-sm font-semibold">{m.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    live ? "bg-white/15 text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {live ? "Live" : "Coming soon"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* one place for the details, so nothing pops over the cards */}
      <div className="mx-auto mt-6 flex max-w-2xl items-center gap-3">
        <button
          type="button"
          onClick={() => nudge.current(-1)}
          aria-label="Previous source"
          className="hidden size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground sm:grid"
        >
          <ChevronLeft className="size-4" />
        </button>
        <Link
          key={mark.id}
          to="/sources/$id"
          params={{ id: mark.id }}
          aria-live="polite"
          className="panel flex min-h-[92px] flex-1 items-center gap-4 p-4 transition-colors animate-in duration-300 fade-in hover:border-primary/40"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              {mark.label} <SourceStatus status={mark.status} />
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{mark.summary}</p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary sm:inline-flex">
            Details <ArrowRight className="size-4" />
          </span>
        </Link>
        <button
          type="button"
          onClick={() => nudge.current(1)}
          aria-label="Next source"
          className="hidden size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground sm:grid"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
