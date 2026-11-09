import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bell, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LandingNav } from "@/components/LandingNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SourceStatus } from "@/components/SourceStatus";
import { useConnectedPlatforms } from "@/components/PlatformStatusBadges";
import { SpotlightCard } from "@/components/landing/SpotlightCard";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { getDocsTools } from "@/lib/docs.functions";
import { PLATFORM_MARKS, SHOW_UPCOMING, markById } from "@/lib/platform-marks";
import { listMySourceRequests, requestSource } from "@/lib/sources.functions";

export const Route = createFileRoute("/sources/$id")({
  beforeLoad: () => {
    if (!SHOW_UPCOMING) throw redirect({ to: "/" });
  },
  loader: async ({ params }) => {
    const mark = markById(params.id);
    if (!mark) throw notFound();
    // Live sources list the real tools AI apps get, straight from the MCP catalog.
    const tools =
      mark.status === "live" ? (await getDocsTools()).filter((t) => t.kind !== "notes") : [];
    return { tools };
  },
  head: ({ params }) => {
    const mark = markById(params.id);
    return {
      meta: [
        { title: `${mark?.label ?? "Source"} — Viral4All Ads` },
        { name: "description", content: mark?.summary ?? "" },
      ],
    };
  },
  component: SourcePage,
});

const GROUPS = [
  { kind: "read", label: "Reads" },
  { kind: "now", label: "Runs at once" },
  { kind: "approval", label: "Needs your OK" },
] as const;

function NotifyMe({ id, signedIn }: { id: string; signedIn: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMySourceRequests);
  const requestFn = useServerFn(requestSource);
  const mine = useQuery({
    queryKey: ["source-requests"],
    queryFn: () => listFn(),
    enabled: signedIn,
    retry: false,
  });
  const ask = useMutation({
    mutationFn: () => requestFn({ data: { source: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-requests"] }),
    onError: () => toast.error("That didn't save. Try again."),
  });

  if (!signedIn) {
    return (
      <Button asChild size="lg">
        <Link to="/auth" search={{ next: `/sources/${id}` }}>
          <Bell /> Notify me
        </Link>
      </Button>
    );
  }
  if (mine.data?.includes(id)) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-full bg-success/10 px-5 text-[15px] font-semibold text-success">
        <Check className="size-4" /> We'll email you when it's live
      </span>
    );
  }
  return (
    <Button size="lg" onClick={() => ask.mutate()} disabled={ask.isPending || mine.isLoading}>
      {ask.isPending ? <Loader2 className="animate-spin" /> : <Bell />} Notify me
    </Button>
  );
}

function SourcePage() {
  const { id } = Route.useParams();
  const { tools } = Route.useLoaderData();
  const mark = markById(id)!;
  const { user } = useSession();
  const signedIn = Boolean(user);
  const { connected } = useConnectedPlatforms();
  const Icon = mark.icon;
  const live = mark.status === "live";
  const others = PLATFORM_MARKS.filter((m) => m.id !== mark.id);

  return (
    <div className="min-h-screen bg-background font-sora antialiased">
      <LandingNav signedIn={signedIn} />
      <main className="mx-auto max-w-5xl px-6 pt-32 pb-24 lg:px-16">
        <Link
          to="/sources"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Sources
        </Link>

        <header className="mt-8 flex flex-wrap items-center gap-5">
          <span className="grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="size-8" />
          </span>
          <div>
            <h1 className="text-[clamp(2rem,4.5vw,3rem)] leading-none font-extrabold tracking-[-0.035em]">
              {mark.label}
            </h1>
            <SourceStatus status={mark.status} className="mt-2 text-sm" />
          </div>
        </header>
        <p className="mt-6 max-w-2xl text-lg text-foreground/80">{mark.summary}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {live ? (
            signedIn && connected.has("meta") ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-full bg-success/10 px-5 text-[15px] font-semibold text-success">
                <Check className="size-4" /> Connected
              </span>
            ) : (
              <Button asChild size="lg">
                <Link
                  to={signedIn ? "/connections" : "/auth"}
                  search={signedIn ? undefined : { next: "/connections" }}
                >
                  Connect Meta
                </Link>
              </Button>
            )
          ) : (
            <NotifyMe id={mark.id} signedIn={signedIn} />
          )}
          {live ? (
            <Button asChild variant="outline" size="lg">
              <Link to="/connect">Connect your AI</Link>
            </Button>
          ) : null}
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <SpotlightCard className="p-6">
            <h2 className="text-xs text-muted-foreground font-medium">
              {live ? "Connects" : "Planned"}
            </h2>
            <p className="mt-3 text-[15px]">{mark.connects}</p>
          </SpotlightCard>
          <SpotlightCard className="p-6">
            <h2 className="text-xs text-muted-foreground font-medium">Syncs</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {mark.syncs.split(/,\s*|:\s*/).map((s) => (
                <span key={s} className="rounded-lg bg-surface-2 px-2.5 py-1 text-[13px]">
                  {s}
                </span>
              ))}
            </div>
          </SpotlightCard>
        </div>

        {tools.length ? (
          <section className="mt-14">
            <h2 className="text-xl font-bold tracking-tight">
              What your AI can do{" "}
              <span className="ml-1 font-mono text-sm font-medium text-muted-foreground">
                {tools.length} tools
              </span>
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {GROUPS.map((g) => {
                const list = tools.filter((t) => t.kind === g.kind);
                return (
                  <SpotlightCard key={g.kind} className="p-5">
                    <h3 className="flex items-center justify-between text-sm font-semibold">
                      {g.label}
                      <span className="font-mono text-xs text-muted-foreground">{list.length}</span>
                    </h3>
                    <ul className="mt-3 space-y-1.5">
                      {list.map((t) => (
                        <li key={t.name} className="text-[13px] text-foreground/80">
                          {t.title}
                        </li>
                      ))}
                    </ul>
                  </SpotlightCard>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-14">
          <h2 className="text-xs text-muted-foreground font-medium">Other sources</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {others.map((m) => (
              <Link
                key={m.id}
                to="/sources/$id"
                params={{ id: m.id }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/40"
              >
                <m.icon className="size-4" />
                {m.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter signedIn={signedIn} />
    </div>
  );
}
