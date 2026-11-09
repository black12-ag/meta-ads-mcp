import { useRef, type ElementType, type ReactNode } from "react";
import { useInView } from "framer-motion";

/** Sets data-play while on screen; `.bento [data-anim]` animations only run then. */
export function PlayOnView({
  as: Tag = "div",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  return (
    <Tag ref={ref} data-play={inView} className={className}>
      {children}
    </Tag>
  );
}
