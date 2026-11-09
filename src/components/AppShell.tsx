import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  BookOpen,
  CircleHelp,
  FolderOpen,
  Home,
  KeyRound,
  LayoutList,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { LogoMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountSwitcher } from "@/components/meta/AccountSwitcher";
import { useConnectedPlatforms } from "@/components/PlatformStatusBadges";
import { MetaConnectionBanner } from "@/components/meta/MetaConnectionBanner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { signOutUser } from "@/lib/auth/firebase-client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { countWaitingApprovals } from "@/lib/approvals.functions";

type Item = { to: string; label: string; icon: typeof Home; also?: string[] };

/** The sidebar, Stripe-style: a few top places, then grouped pages. `also` keeps a page lit. */
const GROUPS: { title?: string; items: Item[] }[] = [
  {
    items: [
      { to: "/dashboard", label: "Home", icon: Home },
      { to: "/approvals", label: "Approvals", icon: ShieldCheck, also: ["/approve"] },
    ],
  },
  {
    title: "Ads",
    items: [
      { to: "/ads", label: "Ads", icon: Megaphone },
      { to: "/campaigns", label: "Campaigns", icon: LayoutList },
      { to: "/meta", label: "Per-ad metrics", icon: Table2 },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/library", label: "Library", icon: FolderOpen },
    ],
  },
  {
    title: "AI",
    items: [
      { to: "/setup", label: "Connect AI", icon: Sparkles },
      { to: "/api-keys", label: "API keys", icon: KeyRound },
      { to: "/audit", label: "Activity log", icon: ScrollText },
      { to: "/manual", label: "Guide", icon: BookOpen },
    ],
  },
];
const SETTINGS: Item = {
  to: "/settings",
  label: "Settings",
  icon: Settings,
  also: ["/connections", "/limits", "/webhooks", "/advanced"],
};
const ALL = [...GROUPS.flatMap((g) => g.items), SETTINGS];
const STORE_PAGES = new Set<string>();
const useManagedOn = () => true;

const isOn = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);
const lit = (pathname: string, item: Item) =>
  isOn(pathname, item.to) || (item.also ?? []).some((m) => isOn(pathname, m));

function Count({ n }: { n: number }) {
  return (
    <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums">
      {n}
    </span>
  );
}

function NavLink({
  item,
  pathname,
  badge,
  onNavigate,
}: {
  item: Item;
  pathname: string;
  badge?: ReactNode;
  onNavigate?: () => void;
}) {
  const on = lit(pathname, item);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
        on
          ? "bg-accent font-medium text-primary"
          : "text-foreground/80 hover:bg-accent/70 hover:text-foreground",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
      <span className="truncate">{item.label}</span>
      {badge}
    </Link>
  );
}

function SidebarNav({
  pathname,
  waiting,
  metaOn,
  onNavigate,
}: {
  pathname: string;
  waiting: number;
  metaOn: boolean;
  onNavigate?: () => void;
}) {
  const managedOn = useManagedOn();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2"
          aria-label="Viral4All Ads home"
        >
          <LogoMark className="size-6" />
          <span className="text-[15px] font-semibold tracking-tight">
            Viral4All <span className="text-primary">Ads</span>
          </span>
        </Link>
      </div>
      <div className="px-3 pb-2">
        <AccountSwitcher full align="left" />
      </div>
      <nav aria-label="App" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {GROUPS.map((g, i) => (
          <div key={g.title ?? i} className="space-y-0.5">
            {g.title ? (
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g.title}</p>
            ) : null}
            {g.items
              .filter((item) => managedOn || !STORE_PAGES.has(item.to))
              .map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  badge={item.to === "/approvals" && waiting > 0 ? <Count n={waiting} /> : null}
                />
              ))}
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-border px-3 py-3">
        <NavLink
          item={SETTINGS}
          pathname={pathname}
          onNavigate={onNavigate}
          badge={
            metaOn ? null : (
              <span
                className="ml-auto size-1.5 rounded-full bg-warning"
                title="Meta not connected"
              />
            )
          }
        />
        <a
          href="/docs"
          className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-foreground/80 transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <BookOpen className="size-4 text-muted-foreground" /> Docs
        </a>
      </div>
    </div>
  );
}

/** ⌘K: jump to any page. */
function CommandSearch({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate();
  const managedOn = useManagedOn();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {ALL.filter((item) => managedOn || !STORE_PAGES.has(item.to)).map((item) => (
            <CommandItem
              key={item.to}
              value={item.label}
              onSelect={() => {
                setOpen(false);
                navigate({ to: item.to });
              }}
            >
              <item.icon className="size-4 text-muted-foreground" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

const iconButton =
  "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { connected, isLoading: platformsLoading } = useConnectedPlatforms();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const countFn = useServerFn(countWaitingApprovals);
  const waitingQuery = useQuery({
    queryKey: ["approvals-count"],
    queryFn: () => countFn({}),
    refetchInterval: 30_000,
    retry: false,
  });
  const waiting = waitingQuery.data ?? 0;
  // Unknown counts as connected, so the warning dot never flashes while loading.
  const metaOn = platformsLoading || connected.has("meta");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutUser();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (onNavigate?: () => void) => (
    <SidebarNav pathname={pathname} waiting={waiting} metaOn={metaOn} onNavigate={onNavigate} />
  );

  return (
    <div className="app-ui min-h-screen bg-background font-sora antialiased">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] border-r border-border bg-background lg:block">
        {nav()}
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[264px] p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {nav(() => setMenuOpen(false))}
        </SheetContent>
      </Sheet>
      <CommandSearch open={searchOpen} setOpen={setSearchOpen} />

      <div className="lg:pl-[240px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className={cn(iconButton, "cursor-pointer lg:hidden")}
            >
              <Menu className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-full max-w-sm cursor-pointer items-center gap-2 rounded-md bg-accent/60 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <Search className="size-4" />
              Search
              <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 font-sans text-[11px] sm:inline">
                ⌘K
              </kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <Link
                to="/approvals"
                aria-label={waiting ? `Approvals, ${waiting} waiting` : "Approvals"}
                className={cn(iconButton, "relative")}
              >
                <ShieldCheck className="size-4" />
                {waiting > 0 ? (
                  <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
                ) : null}
              </Link>
              <a href="/support" aria-label="Help" className={iconButton}>
                <CircleHelp className="size-4" />
              </a>
              <ThemeToggle className="size-8" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="ml-1 grid size-8 cursor-pointer place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary uppercase ring-1 ring-primary/20 transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {(user?.email ?? "?").slice(0, 1)}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                    {user?.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="/support">
                      <LifeBuoy /> Support
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 pt-6 pb-16 sm:px-8 md:pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[26px] leading-8 font-bold tracking-[-0.02em]">{title}</h1>
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>

          {/* Meta status: full controls on its own page; elsewhere only when something is wrong. */}
          {["/dashboard", "/ads", "/campaigns", "/meta", "/analytics", "/connections"].some((p) =>
            isOn(pathname, p),
          ) ? (
            <MetaConnectionBanner quiet={pathname !== "/connections"} className="mt-6" />
          ) : null}
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
