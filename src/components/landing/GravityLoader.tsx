import { ScriptOnce } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SEEN_KEY = "v4a-loader-seen";
// WebGL never reported ready: count it as ready at 1.3 s, so run-out, hold and fade end by ~2.5 s.
const MAX_WAIT_MS = 1300;
const FADE_IN_CSS =
  "@keyframes v4a-loader-in{from{opacity:0;transform:translateY(6px)}}" +
  "@media (prefers-reduced-motion:no-preference){.v4a-loader-in{animation:v4a-loader-in .6s cubic-bezier(.16,1,.3,1) both}}";

const seen = () => {
  try {
    return !!sessionStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
};

type Stage = "loading" | "entering" | "leaving" | "done";

/**
 * Pre-roll for the Gravity field: status line, 2px bar and a 000–100% counter. Eases toward 92%
 * until `ready`, then runs out to 100%, fades and calls `onDone`. Shown once per browser session.
 */
export function GravityLoader({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("loading");
  const bar = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const live = useRef({ ready, onDone });

  useEffect(() => {
    live.current = { ready, onDone };
  });

  // Layout effect: on client navigations a returning visitor never sees a frame of it.
  useLayoutEffect(() => {
    if (seen()) {
      setStage("done");
      live.current.onDone();
      return;
    }
    const start = performance.now();
    let last = start;
    let value = 0;
    let raf = 0;
    const timers: number[] = [];
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (live.current.ready || now - start > MAX_WAIT_MS) {
        value += (100 - value) * 6 * dt;
        if (value >= 99.4) value = 100;
      } else {
        value += (92 - value) * 1.7 * dt;
      }
      if (bar.current) bar.current.style.transform = `scaleX(${value / 100})`;
      if (counter.current) {
        counter.current.textContent = `${String(Math.floor(value)).padStart(3, "0")}%`;
      }
      if (value < 100) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setStage("entering");
      timers.push(window.setTimeout(() => setStage("leaving"), 140));
      timers.push(
        window.setTimeout(() => {
          try {
            sessionStorage.setItem(SEEN_KEY, "1");
          } catch {
            // Storage blocked: it simply shows again next visit.
          }
          setStage("done");
          live.current.onDone();
        }, 140 + 520),
      );
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  if (stage === "done") return null;
  return (
    <div
      role="status"
      // The inline script below may hide it before hydration; that is expected.
      suppressHydrationWarning
      className={cn(
        "v4a-loader fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4",
        "bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#f3eeff_45%,#e4dafc_100%)]",
        "dark:bg-[radial-gradient(circle_at_50%_42%,#1a1426_0%,#120d1c_55%,#0b0812_100%)]",
        "transition-opacity duration-[550ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
        stage === "leaving" && "pointer-events-none opacity-0",
      )}
    >
      {/* Full page loads: hide before first paint for visitors who already saw it this session. */}
      <ScriptOnce>{`try{sessionStorage.getItem("${SEEN_KEY}")&&(document.currentScript.parentNode.style.display="none")}catch(e){}`}</ScriptOnce>
      {/* Without JavaScript it could never finish, so it never shows. */}
      <noscript>
        <style>{".v4a-loader{display:none!important}"}</style>
      </noscript>
      <style>{FADE_IN_CSS}</style>
      <p className="v4a-loader-in font-mono text-[10px] tracking-[0.28em] text-[#6e5d93] uppercase dark:text-[#a294c6]">
        {stage === "loading" ? "Loading Viral4All Ads" : "Ready"}
      </p>
      <div
        aria-hidden="true"
        className="v4a-loader-in h-[2px] w-[clamp(180px,32vw,280px)] rounded-full bg-[rgba(124,58,237,0.14)]"
        style={{ animationDelay: "90ms" }}
      >
        <div
          ref={bar}
          className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#A78BFA,#7C3AED)] shadow-[0_0_10px_rgba(124,58,237,0.55)]"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
      <span
        ref={counter}
        aria-hidden="true"
        className="v4a-loader-in font-mono text-[11px] font-bold text-[#7C3AED] tabular-nums dark:text-[#A78BFA]"
        style={{ animationDelay: "180ms" }}
      >
        000%
      </span>
    </div>
  );
}
