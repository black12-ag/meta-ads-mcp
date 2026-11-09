import type { PlatformMark } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";

/** "Live" or "Coming soon", with a dot; the same badge everywhere a source appears. */
export function SourceStatus({
  status,
  className,
}: {
  status: PlatformMark["status"];
  className?: string;
}) {
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium",
        live ? "text-success" : "text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", live ? "bg-success" : "bg-muted-foreground/50")}
      />
      {live ? "Live" : "Coming soon"}
    </span>
  );
}
