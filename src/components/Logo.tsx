import { cn } from "@/lib/utils";

/** Viral4All Ads mark — a rising V with a subtle 4-shaped cut. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative grid size-7 shrink-0 place-items-center", className)}
      aria-hidden="true"
    >
      <img
        src="/brand/v4-rise-192.png"
        alt=""
        width={192}
        height={192}
        className="size-full object-contain"
      />
    </span>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="text-[15px] font-bold tracking-tight text-foreground">
        Viral4All <span className="text-primary">Ads</span>
      </span>
    </span>
  );
}
