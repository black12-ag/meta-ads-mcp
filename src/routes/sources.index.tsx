import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { LandingNav } from "@/components/LandingNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/components/Reveal";
import { SourceStatus } from "@/components/SourceStatus";
import { SpotlightCard } from "@/components/landing/SpotlightCard";
import { useSession } from "@/hooks/use-session";
import { PLATFORM_MARKS, type PlatformMark } from "@/lib/platform-marks";

export const Route = createFileRoute("/sources/")({
  head: () => ({
    meta: [
      { title: "Sources — Viral4All Ads" },
      {
        name: "description",
        content:
          "The ad platforms your AI can work with through Viral4All Ads, live and coming soon.",
      },
    ],
  }),
  component: SourcesPage,
});

function SourceTile({ mark }: { mark: PlatformMark }) {
  const { id, label, summary, status, icon: Icon } = mark;
  return (
    <Link to="/sources/$id" params={{ id }} className="group block h-full rounded-xl">
      <SpotlightCard className="flex h-full flex-col p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="size-5" />
          </span>
          <span>
            <span className="block text-base font-bold">{label}</span>
            <SourceStatus status={status} />
          </span>
          <ArrowUpRight className="ml-auto size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{summary}</p>
      </SpotlightCard>
    </Link>
  );
}

function SourcesPage() {
  const { user } = useSession();
  const groups = [
    { title: "Live", marks: PLATFORM_MARKS.filter((m) => m.status === "live") },
    { title: "Coming soon", marks: PLATFORM_MARKS.filter((m) => m.status === "soon") },
  ];
  return (
    <div className="min-h-screen bg-background font-sora antialiased">
      <LandingNav signedIn={Boolean(user)} />
      <main className="mx-auto max-w-6xl px-6 pt-36 pb-24 lg:px-16">
        <Reveal>
          <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.035em]">
            Where your AI can work
          </h1>
        </Reveal>
        {groups.map((g) => (
          <section key={g.title} className="mt-14">
            <h2 className="text-xs font-medium text-muted-foreground">{g.title}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.marks.map((m, i) => (
                <Reveal key={m.id} delay={i * 60} className="h-full">
                  <SourceTile mark={m} />
                </Reveal>
              ))}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter signedIn={Boolean(user)} />
    </div>
  );
}
