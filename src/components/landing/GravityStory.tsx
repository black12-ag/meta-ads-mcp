import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, MousePointer2 } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { GravityField } from "@/components/landing/GravityField";
import { GravityLoader } from "@/components/landing/GravityLoader";
import { useTheme } from "@/hooks/use-theme";
import { useSmoothScroll } from "@/hooks/use-smooth-scroll";
import { cn } from "@/lib/utils";

// One full-screen gradient per scene (hero, drop, form + release); they cross-fade because
// CSS can't animate between two gradients. Colors follow the sphere palette of each scene.
const BACKDROPS = [
  "bg-[radial-gradient(circle_at_center,#ffffff_0%,#f1ebff_38%,#d9c9ff_100%)] dark:bg-[radial-gradient(circle_at_center,#1d1533_0%,#120d1f_45%,#0b0813_100%)]",
  "bg-[radial-gradient(circle_at_center,#ffffff_0%,#eaf1ff_38%,#c7d8ff_100%)] dark:bg-[radial-gradient(circle_at_center,#121a33_0%,#0c1120_45%,#080b13_100%)]",
  "bg-[radial-gradient(circle_at_center,#ffffff_0%,#fff0f5_38%,#ffd1e2_100%)] dark:bg-[radial-gradient(circle_at_center,#2a1022_0%,#170a14_45%,#0d070c_100%)]",
];

/** Scene from scroll position, in screen heights, as the sphere field reads it (spec thresholds). */
function useScene() {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const p = scrollY / (innerHeight || 1);
      setScene(p > 1.55 ? 2 : p > 0.7 ? 1 : 0);
    };
    const onChange = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    addEventListener("scroll", onChange, { passive: true });
    addEventListener("resize", onChange);
    return () => {
      removeEventListener("scroll", onChange);
      removeEventListener("resize", onChange);
      cancelAnimationFrame(raf);
    };
  }, []);
  return scene;
}

const STORY_H2 =
  "text-[2.6rem] leading-none font-semibold tracking-[-0.04em] text-balance sm:text-6xl md:text-[80px] md:leading-[0.92]";
const STORY_P = "text-base leading-[1.55] text-foreground/75 md:text-[19px]";
const GLASS_PILL =
  "border border-white/60 bg-white/30 shadow-[inset_0_1.5px_2px_rgb(255_255_255/0.7),0_8px_30px_rgb(0_0_0/0.04)] backdrop-blur-xl dark:border-white/15 dark:bg-white/5 dark:shadow-none";

const CONTROLS = [
  { key: "Approvals", value: "Every change waits for you" },
  { key: "Limits", value: "Caps your AI can't pass" },
  { key: "Undo", value: "One click back" },
];

/**
 * The landing's first four screens: the sphere field clusters behind the hero, falls, forms a "V",
 * then rushes past the camera. Everything after it scrolls over an empty canvas.
 */
export function GravityStory({ signedIn }: { signedIn: boolean }) {
  const { dark } = useTheme();
  const scene = useScene();
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  useSmoothScroll();

  // Hero copy waits for the loader, then rises in. `.js` is set before paint, so no-JS still sees it.
  const enter = (delay: number, className: string) => ({
    className: cn("[.js_&]:opacity-0", started && "animate-fade-up", className),
    style: { animationDelay: `${delay}s` },
  });

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        {BACKDROPS.map((bg, i) => (
          <div
            key={bg}
            className={cn(
              "absolute inset-0 transition-opacity duration-[1200ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
              bg,
              i === 0 || scene === i ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
      <GravityLoader ready={ready} onDone={() => setStarted(true)} />
      <GravityField
        started={started}
        theme={dark ? "dark" : "light"}
        onReady={() => setReady(true)}
      />

      <div className="relative z-10">
        <section className="relative flex min-h-svh items-end px-6 pt-28 pb-12 md:px-12 md:pb-16 wide:items-center">
          {/* phones and tablets: keeps the copy readable where it meets the cluster above it */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-background/95 via-background/60 to-transparent wide:hidden"
          />
          <div className="relative mx-auto w-full max-w-[1400px]">
            <div className="flex max-w-[560px] flex-col items-start">
              <h1
                {...enter(
                  0.28,
                  "text-[2.6rem] leading-[0.95] font-semibold tracking-[-0.04em] sm:text-6xl md:text-[clamp(56px,5.6vw,80px)]",
                )}
              >
                Run your ads
                <br />
                <span className="text-primary">with AI.</span>
              </h1>
              <p
                {...enter(
                  0.38,
                  "mt-6 max-w-md text-base leading-[1.5] font-medium text-foreground/75 md:text-lg",
                )}
              >
                Claude, ChatGPT or Cursor runs your Meta ads. Nothing spends without your OK.
              </p>
              <div {...enter(0.46, "mt-8 flex flex-wrap gap-3")}>
                <Link
                  to={signedIn ? "/dashboard" : "/auth"}
                  className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[0_1px_2px_hsl(var(--shadow)/0.3),inset_0_1px_0_rgb(255_255_255/0.2)] transition-[transform,filter] duration-200 hover:-translate-y-px hover:brightness-110 active:scale-[0.98]"
                >
                  {signedIn ? "Open console" : "Start free"}
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#how-it-works"
                  className={cn(
                    "inline-flex h-11 items-center rounded-full px-6 text-[15px] font-semibold text-foreground transition-transform duration-200 hover:-translate-y-px active:scale-[0.98]",
                    GLASS_PILL,
                  )}
                >
                  See how it works
                </a>
              </div>
              <div
                {...enter(
                  0.56,
                  "mt-8 flex items-center gap-6 text-xs font-medium text-muted-foreground",
                )}
              >
                <span className="hidden items-center gap-2 motion-safe:animate-pulse md:flex">
                  <ArrowDown className="size-3.5" /> Scroll
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* copy sits high: the spheres pile up along the bottom of this screen */}
        <section className="flex min-h-svh items-start px-6 pt-28 pb-16 md:px-12 md:pt-32 md:pb-40">
          <div className="mx-auto grid w-full max-w-[1400px] items-start gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <Reveal as="h2" y={42} delay={100} className={STORY_H2}>
                Nothing spends
                <br />
                until you say so.
              </Reveal>
            </div>
            <Reveal
              y={42}
              delay={250}
              // short phones: the cards would push this screen past one screen height
              className="flex flex-col gap-3.5 lg:col-span-5 lg:pt-3 max-md:[@media(max-height:740px)]:hidden"
            >
              {CONTROLS.map((c) => (
                <div
                  key={c.key}
                  className="rounded-xl bg-gradient-to-b from-white/80 via-white/30 to-white/10 p-px dark:from-white/20 dark:via-white/5 dark:to-white/5"
                >
                  <div className="relative overflow-hidden rounded-[15px] bg-white/25 px-5 py-3.5 backdrop-blur-xl sm:px-6 sm:py-5 dark:bg-white/[0.04]">
                    <span
                      aria-hidden
                      className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/30"
                    />
                    <p className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                      <span>{c.key}</span>
                      <span className="ml-auto size-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,hsl(var(--brand-light)),hsl(var(--brand)))] shadow-[0_0_8px_hsl(var(--brand)/0.6)]" />
                    </p>
                    <p className="mt-2 text-lg font-semibold tracking-tight">{c.value}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="flex min-h-svh flex-col justify-between px-6 pt-24 pb-16 md:px-12 md:py-44">
          <div className="mx-auto w-full max-w-[1400px]">
            <Reveal as="h2" y={42} delay={100} className={cn(STORY_H2, "max-w-2xl")}>
              Every AI,
              <br />
              one place.
            </Reveal>
          </div>
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="max-w-sm">
              <Reveal as="p" y={42} delay={150} className={STORY_P}>
                Claude, ChatGPT, Cursor and more, on one endpoint.
              </Reveal>
              <Reveal y={42} delay={280} className="mt-7">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium text-foreground/75",
                    GLASS_PILL,
                  )}
                >
                  <MousePointer2 className="size-3.5" /> Move your cursor through it
                </span>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="flex min-h-svh flex-col items-center justify-center px-6 py-36 text-center md:px-12 md:py-44">
          <div className="max-w-3xl">
            <Reveal
              as="h2"
              y={42}
              delay={120}
              className="text-[2.8rem] leading-none font-semibold tracking-[-0.04em] sm:text-7xl md:text-[88px] md:leading-[0.92]"
            >
              And then,
              <br />
              hands off.
            </Reveal>
            <Reveal as="p" y={42} delay={240} className={cn(STORY_P, "mx-auto mt-8 max-w-md")}>
              Your AI watches spend around the clock. You approve.
            </Reveal>
          </div>
        </section>
      </div>
    </>
  );
}
