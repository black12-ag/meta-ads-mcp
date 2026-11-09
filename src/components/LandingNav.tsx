import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Menu,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Terminal,
  Webhook,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Approvals & limits",
    text: "Nothing spends without your OK.",
    href: "/docs#safety",
  },
  {
    icon: BellRing,
    title: "Alerts",
    text: "An email when spend jumps.",
    href: "/docs#safety",
  },
  {
    icon: BarChart3,
    title: "Reports",
    text: "Results in plain words.",
    href: "/docs#tools",
  },
  {
    icon: Terminal,
    title: "CLI & API",
    text: "Every tool, from code.",
    href: "/docs#api",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    text: "Events to Slack or Discord.",
    href: "/docs#webhooks",
  },
  {
    icon: Puzzle,
    title: "Claude plugin",
    text: "Ready-made skills.",
    href: "/docs#plugin",
  },
];

// "/#…" so the section links also work from /docs, /connect and the legal pages.
const NAV_LINKS = [
  { label: "Sources", href: "/sources" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Docs", href: "/docs" },
  { label: "Connect AI", href: "/connect" },
];

const LINK =
  "inline-flex h-9 items-center rounded-full bg-transparent px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FeatureIcon({ icon: Icon }: { icon: (typeof FEATURES)[number]["icon"] }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

function ProductPanel() {
  return (
    <div className="grid w-[720px] grid-cols-[1fr_216px] gap-2 p-2">
      <ul className="grid grid-cols-2 gap-1">
        {FEATURES.map((f) => (
          <li key={f.title}>
            <NavigationMenuLink asChild>
              <a
                href={f.href}
                className="group flex gap-3 rounded-xl p-3 transition-colors duration-200 hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <FeatureIcon icon={f.icon} />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{f.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                    {f.text}
                  </span>
                </span>
              </a>
            </NavigationMenuLink>
          </li>
        ))}
      </ul>
      <NavigationMenuLink asChild>
        <Link
          to="/connect"
          className="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-brand to-brand-deep p-5 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden
            className="absolute -right-10 -top-10 size-36 rounded-full bg-white/15 blur-2xl transition-transform duration-500 group-hover:scale-125"
          />
          <Sparkles className="relative size-5" aria-hidden />
          <span className="relative">
            <span className="block text-base font-bold">Connect your AI</span>
            <span className="mt-1 block text-[13px] leading-snug text-white/80">
              Claude, ChatGPT, Cursor and more.
            </span>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
              Set it up
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </span>
        </Link>
      </NavigationMenuLink>
    </div>
  );
}

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cta = signedIn ? "Open console" : "Start free";
  const close = () => setOpen(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-full border pl-4 pr-2 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300",
          scrolled || open
            ? "border-border bg-background/85 shadow-[var(--shadow-card)]"
            : "border-border/60 bg-background/55",
        )}
      >
        <Link
          to="/"
          className="group flex items-center text-foreground"
          aria-label="Viral4All Ads home"
        >
          <Logo />
        </Link>

        <NavigationMenu className="hidden lg:flex">
          <NavigationMenuList className="gap-0.5 space-x-0">
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  LINK,
                  "data-[state=open]:bg-accent data-[state=open]:text-foreground",
                )}
              >
                Product
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ProductPanel />
              </NavigationMenuContent>
            </NavigationMenuItem>
            {NAV_LINKS.map((link) => (
              <NavigationMenuItem key={link.label}>
                <NavigationMenuLink href={link.href} className={LINK}>
                  {link.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to={signedIn ? "/dashboard" : "/auth"}
            className="hidden h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-px hover:shadow-[0_10px_30px_-12px_hsl(var(--primary))] hover:brightness-110 active:translate-y-0 active:scale-[0.98] sm:inline-flex"
          >
            {cta}
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            {open ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="mobile-nav"
          className="mx-auto mt-2 max-h-[calc(100svh-5.5rem)] max-w-6xl overflow-y-auto rounded-3xl border border-border bg-background/95 p-3 shadow-[var(--shadow-card)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 lg:hidden"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Product
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <a
                  href={f.href}
                  onClick={close}
                  className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent"
                >
                  <FeatureIcon icon={f.icon} />
                  <span className="text-sm font-semibold text-foreground">{f.title}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="my-2 h-px bg-border" />
          <ul className="grid gap-0.5">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  onClick={close}
                  className="flex min-h-11 items-center rounded-xl px-3 text-[15px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            to={signedIn ? "/dashboard" : "/auth"}
            onClick={close}
            className="mt-3 flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {cta}
          </Link>
        </div>
      )}
    </header>
  );
}
