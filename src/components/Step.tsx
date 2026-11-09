import type { ReactNode } from "react";

/** A numbered step label for short forms ("1  Pay with"). */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium">
      <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      {children}
    </span>
  );
}
