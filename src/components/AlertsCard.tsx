import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRecentAlerts } from "@/lib/alerts.functions";
import { cn } from "@/lib/utils";

const ago = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
};

/** Home: what the daily account check found this week. Renders nothing when all is quiet. */
export function AlertsCard() {
  const fetchAlerts = useServerFn(listRecentAlerts);
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => fetchAlerts({}), retry: false });
  if (!alerts.data?.length) return null;

  return (
    <section className="panel mb-8 p-6" aria-label="Alerts">
      <h2 className="text-base font-semibold">Alerts</h2>
      <ul className="mt-3 divide-y divide-border">
        {alerts.data.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-3">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                a.severity === "critical" ? "bg-destructive" : "bg-warning",
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  a.severity === "critical" && "text-destructive",
                )}
              >
                <span className="sr-only">
                  {a.severity === "critical" ? "Urgent: " : "Warning: "}
                </span>
                {a.title}
              </p>
              {a.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p> : null}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{ago(a.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
