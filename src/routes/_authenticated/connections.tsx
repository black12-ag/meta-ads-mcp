import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { MetaConnectionCard } from "@/components/meta/MetaConnectionCard";
import { PLATFORMS } from "@/lib/platforms";
import { SHOW_UPCOMING } from "@/lib/platform-marks";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Viral4All Ads" },
      {
        name: "description",
        content:
          "Connect your Meta Ads account with OAuth and pick the active ad account and Page used across the console.",
      },
      { property: "og:title", content: "Connections — Viral4All Ads" },
      {
        property: "og:description",
        content: "OAuth-secured platform connections for your ad accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Connections,
});

const LIVE = new Set(["meta"]);

function Connections() {
  const upcoming = PLATFORMS.filter((p) => !LIVE.has(p.id));

  return (
    <AppShell title="Connections">
      <MetaConnectionCard />

      {SHOW_UPCOMING ? (
        <div className="panel mt-6">
          <div className="flex items-end justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Other platforms</h2>
            <Link to="/setup" className="text-xs text-primary hover:underline">
              MCP setup →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {upcoming.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.blurb}</p>
                </div>
                <Badge variant="secondary">Not connected</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 text-sm">
          <Link to="/setup" className="text-primary hover:underline">
            Connect your AI →
          </Link>
        </p>
      )}
    </AppShell>
  );
}
