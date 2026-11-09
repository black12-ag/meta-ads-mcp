import { useRef, type ElementType, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card with a soft light that follows the pointer and lights the edge nearest it (see `.spot`). */
export function SpotlightCard({
  as: Tag = "div",
  className,
  children,
  onMouseEnter,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  onMouseEnter?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <Tag
      ref={ref}
      onPointerMove={onMove}
      onMouseEnter={onMouseEnter}
      className={cn(
        "spot relative overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] transition-[border-color] duration-300 hover:border-primary/30",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
