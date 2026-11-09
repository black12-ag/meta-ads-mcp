import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A collectible card: chrome edge and a resting tilt. On hover it straightens and tips toward the
 * mouse while a holographic foil and glare follow it (see `.holo` in styles.css). Touch and
 * reduced motion keep the resting tilt only.
 */
export function HoloCard({
  tilt = 0,
  className,
  children,
}: {
  /** resting rotation in degrees */
  tilt?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - py) * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * 14).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
  };
  const leave = () => {
    for (const k of ["--rx", "--ry", "--gx", "--gy"]) ref.current?.style.removeProperty(k);
  };
  return (
    <div className={cn("[perspective:1000px]", className)}>
      <div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={leave}
        style={{ "--tilt": `${tilt}deg` } as CSSProperties}
        className="holo h-full"
      >
        <div className="holo-face">{children}</div>
      </div>
    </div>
  );
}
