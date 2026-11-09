import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MetaConnectionCard } from "@/components/meta/MetaConnectionCard";
import { LimitsSettings } from "@/components/settings/LimitsSettings";
import { WebhookEndpoints } from "@/components/WebhookEndpoints";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Viral4All Ads" }] }),
  component: SettingsPage,
});

const PARTS = [
  { id: "meta", title: "Meta connection" },
  { id: "limits", title: "Goals & limits" },
  { id: "notifications", title: "Notifications" },
  { id: "advanced", title: "Advanced" },
];

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Every setting on one page; developer-only setup sits behind the Advanced links. */
function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {PARTS.map((p) => (
              <li key={p.id}>
                <a
                  href={`#${p.id}`}
                  className="block rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {p.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-12">
          <Part id="meta" title="Meta connection">
            <MetaConnectionCard />
          </Part>
          <Part id="limits" title="Goals & limits">
            <LimitsSettings />
          </Part>
          <Part id="notifications" title="Notifications">
            <WebhookEndpoints />
          </Part>
          <Part id="advanced" title="Advanced">
            <ul className="panel divide-y divide-border">
              {[
                {
                  to: "/advanced",
                  title: "Meta app setup",
                  text: "Your own Meta app's URLs and verify token.",
                },
                {
                  to: "/webhooks",
                  title: "Meta webhooks",
                  text: "Live updates from Meta and failed-sync retries.",
                },
              ].map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{l.title}</span>
                      <span className="block text-sm text-muted-foreground">{l.text}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Part>
        </div>
      </div>
    </AppShell>
  );
}
