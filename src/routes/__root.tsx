import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { THEME_KEY } from "@/hooks/use-theme";
import { auth, onAuthStateChanged } from "@/lib/auth/firebase-client";

import appCss from "../styles.css?url";

function StatusPage({
  image,
  title,
  text,
  actions,
}: {
  /** the lion mascot for this state, from /brand/mascot */
  image: string;
  title: string;
  text: string;
  actions: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 font-sora">
      <div className="w-full max-w-sm text-center">
        <img
          src={image}
          alt=""
          width={240}
          height={240}
          className="mx-auto size-60 rounded-3xl object-cover"
        />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">{actions}</div>
        <p className="mt-6 text-[13px] text-muted-foreground">
          Need help?{" "}
          <Link
            to="/support"
            className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Contact support
          </Link>
        </p>
      </div>
    </main>
  );
}

function NotFoundComponent() {
  return (
    <StatusPage
      image="/brand/mascot/mascot-404.webp"
      title="Page not found"
      text="This link is wrong or the page has moved."
      actions={
        <>
          <Button asChild size="lg">
            <Link to="/">Go home</Link>
          </Button>
          <Button variant="outline" size="lg" onClick={() => window.history.back()}>
            Back
          </Button>
        </>
      }
    />
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  // Details stay in the console; users only see the friendly message.
  console.error(error);
  const router = useRouter();

  return (
    <StatusPage
      image="/brand/mascot/mascot-error.webp"
      title="Something went wrong"
      text="This page didn't load. Try again in a moment."
      actions={
        <>
          <Button
            size="lg"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          {/* Full page load: the router may be what broke. */}
          <Button asChild variant="outline" size="lg">
            <a href="/">Go home</a>
          </Button>
        </>
      }
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Viral4All Ads — Meta Ads for your AI" },
      {
        name: "description",
        content:
          "One MCP endpoint that lets Claude, ChatGPT or Cursor run your Meta (Facebook and Instagram) ad campaigns, with limits and approvals.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Viral4All Ads" },
      { property: "og:image", content: "https://ads.viral4all.com/og-card.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Viral4All Ads — run your Meta ads from anywhere" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://ads.viral4all.com/og-card.png" },
      { name: "theme-color", content: "#F6F4FB", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0E0B16", media: "(prefers-color-scheme: dark)" },
      { name: "application-name", content: "Viral4All Ads" },
      { name: "apple-mobile-web-app-title", content: "Viral4All Ads" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Barlow+Condensed:ital,wght@0,700;0,800;1,800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/brand/v4-rise-16.png", sizes: "16x16", type: "image/png" },
      { rel: "icon", href: "/brand/v4-rise-32.png", sizes: "32x32", type: "image/png" },
      { rel: "apple-touch-icon", href: "/brand/v4-rise-180.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Runs before first paint so the saved (or system) theme never flashes the wrong colors.
// With no saved choice it also follows the system theme when that changes.
const THEME_SCRIPT = `try{var m=matchMedia("(prefers-color-scheme: dark)"),e=document.documentElement;e.classList.add("js");var f=function(){var t=localStorage.getItem("${THEME_KEY}"),d=t?t==="dark":m.matches;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"};f();m.addEventListener("change",function(){if(!localStorage.getItem("${THEME_KEY}"))f()})}catch(e){}`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the class before React hydrates, so the server markup can't match it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthSync({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter();
  useEffect(() => {
    let first = true;
    return onAuthStateChanged(auth(), (user) => {
      // The first callback only reports the restored session; later ones are real sign-in/out.
      if (first) {
        first = false;
        return;
      }
      router.invalidate();
      if (user) queryClient.invalidateQueries();
    });
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync queryClient={queryClient} />
      {/* reducedMotion="user": framer-motion skips transform animations when the OS asks for less motion. */}
      <MotionConfig reducedMotion="user">
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </MotionConfig>
      <Toaster />
    </QueryClientProvider>
  );
}
