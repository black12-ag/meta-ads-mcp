import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  auth,
  authErrorMessage,
  completeGoogleRedirect,
  onAuthStateChanged,
  sendPasswordReset,
  signInEmail,
  signInGoogle,
  signUpEmail,
} from "@/lib/auth/firebase-client";
import { AuthAside } from "@/components/AuthAside";
import { LogoMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { safeNext } from "@/lib/auth/safe-next";
import { getTurnstileSiteKey } from "@/lib/turnstile.functions";
import { useHumanCheck } from "@/hooks/use-human-check";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Viral4All Ads" },
      {
        name: "description",
        content:
          "Sign in to Viral4All Ads to run your ad campaigns, social posts and MCP connections from any AI assistant.",
      },
      { property: "og:title", content: "Sign in — Viral4All Ads" },
      { property: "og:description", content: "Sign in to your ads and social command center." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  loader: () => getTurnstileSiteKey(),
  component: AuthPage,
});

const field =
  "h-12 w-full rounded-xl border border-input bg-surface px-4 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/15";

/** Google's four-colour "G", drawn inline so it works offline and needs no extra request. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const robotBox = useRef<HTMLDivElement>(null);
  const isHuman = useHumanCheck(Route.useLoaderData(), robotBox);
  const notHuman =
    "We couldn't confirm you're human. Reload the page, or use Continue with Google.";

  const destination = next ?? "/dashboard";
  // A destination with a query string (the OAuth consent page) needs a real page load: the
  // router would treat "?..." as part of the path.
  const go = useCallback(() => {
    if (!destination.includes("?")) return navigate({ to: destination, replace: true });
    // Same-site only: "/\\evil.com" would otherwise leave the site after sign-in.
    const url = new URL(destination, window.location.origin);
    if (url.origin !== window.location.origin) return navigate({ to: "/dashboard", replace: true });
    window.location.replace(url.pathname + url.search);
  }, [navigate, destination]);

  useEffect(() => {
    // Watch the auth state instead of checking once: a Google sign-in (popup or redirect) can
    // land a moment after this page mounts, and a single check would miss it and strand the
    // person on the sign-in form.
    const unsubscribe = onAuthStateChanged(auth(), (user) => {
      if (user) go();
    });
    // Consume a pending redirect credential; this fires the listener above on success.
    completeGoogleRedirect().catch(() => {});
    return unsubscribe;
  }, [go]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!(await isHuman())) return void toast.error(notHuman);
      if (mode === "signup") {
        await signUpEmail(email, password);
        toast.success("Account created. Check your email to verify it.");
      } else {
        await signInEmail(email, password);
      }
      go();
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // No robot check here: awaiting one would cost the click that lets the Google popup open,
  // and Google runs its own bot checks.
  async function google() {
    if (busy) return;
    setBusy(true);
    try {
      await signInGoogle();
      go();
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      toast.error("Type your email address first, then press Forgot password.");
      return;
    }
    setBusy(true);
    try {
      if (!(await isHuman())) return void toast.error(notHuman);
      await sendPasswordReset(email.trim());
      toast.success("Check your email for a link to set a new password.");
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isSignin = mode === "signin";

  return (
    <div className="grid min-h-screen bg-hero-bg font-sora antialiased lg:grid-cols-[1fr_minmax(0,560px)]">
      <AuthAside />

      <div className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <ThemeToggle className="absolute top-5 right-5" />
        <div
          className="w-full max-w-sm opacity-0 animate-fade-up"
          style={{ animationDelay: "0.08s" }}
        >
          <Link
            to="/"
            className="group mb-10 inline-flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <ArrowLeft className="size-4 -translate-x-0 text-muted-foreground transition-all duration-300 group-hover:-translate-x-1 group-hover:text-primary" />
            <LogoMark className="size-6" />
            <span>
              Viral4All <span className="text-primary">Ads</span>
            </span>
          </Link>

          <h1 className="text-[clamp(1.875rem,4vw,2.5rem)] leading-[1.1] font-extrabold tracking-[-0.035em]">
            {isSignin ? "Sign in" : "Create account"}
          </h1>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="mt-8 flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-border bg-surface text-sm font-semibold shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="sr-only" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className={field}
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="sr-only" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className={field}
              type="password"
              required
              minLength={6}
              autoComplete={isSignin ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {/* Cloudflare Turnstile: empty unless Cloudflare wants a click; above the button so it's ticked first */}
            <div ref={robotBox} className="empty:hidden" />
            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {busy ? "Please wait" : isSignin ? "Sign in" : "Create account"}
            </button>
          </form>

          {isSignin ? (
            <button
              type="button"
              onClick={resetPassword}
              disabled={busy}
              className="mt-4 cursor-pointer text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline disabled:opacity-60"
            >
              Forgot password?
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setMode(isSignin ? "signup" : "signin")}
            className="mt-6 block cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {isSignin ? (
              <>
                No account? <span className="text-primary">Sign up</span>
              </>
            ) : (
              <>
                Already have an account? <span className="text-primary">Sign in</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
