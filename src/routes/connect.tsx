import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plug } from "lucide-react";
import { ConnectGuide, Troubleshooting } from "@/components/ConnectGuide";
import { LandingNav } from "@/components/LandingNav";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Connect AI to your Meta ads — Viral4All Ads" },
      {
        name: "description",
        content:
          "Step by step: connect Claude, ChatGPT, Gemini, Codex, Cursor or any MCP app to your Meta ads, with approvals and limits built in. Plus fixes for common problems.",
      },
      { property: "og:title", content: "Connect any AI app to your Meta ads — Viral4All Ads" },
      {
        property: "og:description",
        content: "Paste one URL and sign in. Changes that spend money wait for your approval.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
  component: Connect,
});

function Connect() {
  const { user } = useSession();
  const signedIn = Boolean(user);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav signedIn={signedIn} />

      <header className="relative overflow-hidden border-b border-border px-6 pt-36 pb-20 lg:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]"
        />
        <div className="relative mx-auto max-w-6xl">
          <Reveal delay={70}>
            <h1 className="max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">
              Connect your AI to your Meta ads
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Paste one URL and sign in. Anything that spends money waits for your OK.
            </p>
          </Reveal>
          <Reveal delay={210}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to={signedIn ? "/dashboard" : "/auth"}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-[transform,box-shadow,filter] duration-300 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_40px_-14px_hsl(var(--primary))] active:translate-y-0"
              >
                {signedIn ? "Open the console" : "Start free"}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#troubleshooting"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm transition-colors duration-300 hover:border-primary/60 hover:text-primary bg-surface"
              >
                Troubleshooting
              </a>
            </div>
          </Reveal>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20 lg:px-16">
        <div className="max-w-4xl space-y-24">
          <section id="apps" className="scroll-mt-28">
            <SectionTitle title="Steps for each app" />
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              You need a Viral4All Ads account with Meta connected on the{" "}
              <Link to="/connections" className="text-primary underline">
                Meta connection
              </Link>{" "}
              page. Then pick your app.
            </p>
            <div className="panel mt-8 p-6">
              <ConnectGuide />
            </div>
          </section>

          <section id="troubleshooting" className="scroll-mt-28">
            <SectionTitle title="When something doesn't work" />
            <Troubleshooting className="mt-8" />
            <p className="mt-6 text-sm text-muted-foreground">
              Still stuck? See{" "}
              <Link to="/support" className="text-primary underline">
                Support
              </Link>
              .
            </p>
          </section>
        </div>
      </main>

      <SiteFooter signedIn={signedIn} />
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div>
      <h2 className="max-w-2xl text-2xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
