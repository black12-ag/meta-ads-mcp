import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Counts to `value` when it first arrives or changes (same ease-out-expo as Reveal).
 * Reduced motion shows the final number at once.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced || !Number.isFinite(value)) {
      setShown(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => {
        from.current = n;
        setShown(n);
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return <>{format(shown)}</>;
}
