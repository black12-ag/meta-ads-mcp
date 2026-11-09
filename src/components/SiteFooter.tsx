import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Github, Mail } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { SHOW_UPCOMING } from "@/lib/platform-marks";

export const CONTACT_EMAIL = "support@viral4all.com";

const TICKER = ["Ask your AI", "Approve the change", "Stay in control", "Run your ads with AI"];

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Connect AI", href: "/connect" },
      ...(SHOW_UPCOMING ? [{ label: "Sources", href: "/sources" }] : []),
      { label: "How it works", href: "/how-it-works" },
      { label: "Approvals & limits", href: "/docs#safety" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "REST API", href: "/docs#api" },
      { label: "CLI", href: "/docs#cli" },
      { label: "Webhooks", href: "/docs#webhooks" },
      { label: "llms.txt", href: "/llms.txt" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Support", href: "/support" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Sign in", href: "/auth" },
    ],
  },
];

/** Public-page footer: always dark, rounded top, a slow word ticker. */
export function SiteFooter({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <footer className="relative z-10 overflow-hidden rounded-t-[2.5rem] bg-ink text-white md:rounded-t-[4rem] dark:border-t dark:border-white/10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[28rem] rounded-full bg-[radial-gradient(circle,hsl(var(--brand)/0.4)_0%,transparent_65%)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-40 size-[32rem] rounded-full bg-[radial-gradient(circle,hsl(var(--brand)/0.27)_0%,transparent_65%)] blur-2xl"
      />

      <div aria-hidden className="relative overflow-hidden border-b border-white/10 py-5">
        <div className="flex w-max animate-[marquee-half_26s_linear_infinite] motion-reduce:animate-none">
          {[0, 1].map((copy) =>
            TICKER.map((word) => (
              <span
                key={`${copy}-${word}`}
                className="flex items-center gap-16 px-8 text-[clamp(28px,6vw,64px)] font-semibold tracking-tight whitespace-nowrap text-white/90"
              >
                {word}
                <span className="size-2.5 rounded-full bg-brand-light" />
              </span>
            )),
          )}
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-10 md:px-12 md:pt-24">
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <h2 className="text-4xl leading-[0.95] font-semibold tracking-tight md:text-6xl">
              Your ads.
              <br />
              Your AI.
              <br />
              Your call.
            </h2>
            <Link
              to={signedIn ? "/dashboard" : "/auth"}
              className="group mt-9 inline-flex items-center gap-4 rounded-full border border-white/15 bg-white/5 py-2 pr-2 pl-7 text-base font-medium transition-colors hover:bg-white/10 md:text-lg"
            >
              {signedIn ? "Open console" : "Start free"}
              <span className="grid size-10 place-items-center rounded-full bg-[radial-gradient(circle_at_50%_30%,hsl(var(--brand-light))_0%,hsl(var(--brand))_55%,hsl(var(--brand-deep))_100%)]">
                <ArrowUpRight
                  className="size-4 transition-transform duration-300 group-hover:rotate-45"
                  aria-hidden
                />
              </span>
            </Link>
          </Reveal>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {COLUMNS.map((col, i) => (
              <Reveal key={col.title} delay={i * 80}>
                <p className="text-xs font-semibold text-white/50">{col.title}</p>
                <ul className="mt-5 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="group inline-flex items-center gap-1 text-[15px] text-white/75 transition-colors hover:text-white"
                      >
                        {l.label}
                        <ArrowUpRight
                          className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                          aria-hidden
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </nav>
        </div>

        <div className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-7 md:mt-28">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
              <LogoMark className="size-6" />
              Viral4All <span className="text-brand-light">Ads</span>
            </span>
            <span className="font-mono text-[11px] text-white/50">
              © {new Date().getFullYear()} Viral4All Ads. Free software under AGPL-3.0.
            </span>
          </div>
          <div className="flex gap-2">
            <a
              href="https://github.com/black12-ag/meta-ads-mcp"
              aria-label="Viral4All Ads on GitHub"
              className="grid size-10 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:text-white"
            >
              <Github className="size-4" aria-hidden />
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              aria-label={`Email ${CONTACT_EMAIL}`}
              className="grid size-10 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:text-white"
            >
              <Mail className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
