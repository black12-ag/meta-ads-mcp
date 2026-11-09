import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMetaAccounts } from "@/lib/meta.functions";
import { PLATFORM_MARKS } from "@/lib/platform-marks";
import { cn } from "@/lib/utils";

/** Platforms with a real, live OAuth connection for the signed-in user. */
export function useConnectedPlatforms() {
  const accountsFn = useServerFn(listMetaAccounts);
  const { data, isLoading } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => accountsFn({}),
    retry: false,
  });
  const connected = new Set<string>();
  if (data?.connected) connected.add("meta");
  return { connected, isLoading };
}

export function PlatformStatusBadges({
  variant = "row",
  className,
}: {
  variant?: "row" | "stack";
  className?: string;
}) {
  const { connected } = useConnectedPlatforms();

  // One badge per real platform (Instagram/YouTube ride along with Meta/Google).
  const marks = PLATFORM_MARKS.filter(
    (m, i, all) => all.findIndex((x) => x.platform === m.platform) === i,
  );

  return (
    <div
      className={cn(
        "flex gap-1.5",
        variant === "stack" ? "flex-col" : "flex-wrap items-center",
        className,
      )}
    >
      {marks.map(({ id, platform, label, status, icon: Icon }) => {
        const on = connected.has(platform);
        const state = on ? "Connected" : status === "live" ? "Connect" : "Soon";
        return (
          <Link
            key={id}
            to={status === "live" ? "/connections" : "/sources/$id"}
            params={status === "live" ? undefined : { id }}
            className={cn(
              "flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors",
              variant === "stack" && "justify-between",
              on
                ? "border-success/30 bg-success/10 text-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {label}
            </span>
            <span className={cn("text-[11px]", on ? "text-success" : "text-muted-foreground")}>
              {state}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
