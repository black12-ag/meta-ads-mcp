import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll reveal. One-shot, short, subtle — a settle, not an entrance.
 * Falls back to fully-visible static content when the user prefers reduced motion
 * or when IntersectionObserver is unavailable (SSR / older browsers).
 */
export function Reveal({
  children,
  as: Tag = "div",
  className,
  delay = 0,
  y = 14,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** ms — keep stagger steps at 60–80ms so a group still reads as one gesture */
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // Anything already at or above the fold is shown without waiting for a scroll event.
    const inView = () => {
      const r = node.getBoundingClientRect();
      return r.top < window.innerHeight * 0.92 && r.bottom > 0;
    };
    if (inView()) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );

    io.observe(node);

    // Safety net: fast/programmatic scrolling can outrun observer sampling.
    const onScroll = () => {
      if (inView()) {
        setShown(true);
        io.disconnect();
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-[450ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
        className,
      )}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px)`,
        transitionDelay: shown ? `${delay}ms` : "0ms",
      }}
    >
      {children}
    </Tag>
  );
}
