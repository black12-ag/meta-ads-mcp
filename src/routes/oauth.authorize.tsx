import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Radio, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/hooks/use-session";
import { signOutUser } from "@/lib/auth/firebase-client";
import { getOnboarding } from "@/lib/onboarding.functions";
import {
  approveAuthorization,
  denyAuthorization,
  describeAuthorization,
} from "@/lib/oauth.functions";

export const Route = createFileRoute("/oauth/authorize")({
  head: () => ({
    meta: [{ title: "Connect an AI app — Viral4All Ads" }, { name: "robots", content: "noindex" }],
  }),
  component: AuthorizePage,
});

type Described = Awaited<ReturnType<typeof describeAuthorization>>;

const button =
  "flex h-12 w-full cursor-pointer items-center justify-center rounded-xl px-3 text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-60";

function AuthorizePage() {
  const { user, loading } = useSession();
  const describe = useServerFn(describeAuthorization);
  const approve = useServerFn(approveAuthorization);
  const deny = useServerFn(denyAuthorization);
  // Read the raw query string: the router's search parsing would turn values like state="123" into numbers.
  const [params, setParams] = useState<Record<string, string> | null>(null);
  const [info, setInfo] = useState<Described | null>(null);
  const [allowWrite, setAllowWrite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // An account without Meta gives the AI app nothing to see; say so before it's approved.
  const onboarding = useServerFn(getOnboarding);
  const [hasMeta, setHasMeta] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return setHasMeta(null);
    onboarding({})
      .then((o) => setHasMeta(o.meta))
      .catch(() => setHasMeta(null));
  }, [user, onboarding]);

  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(window.location.search));
    setParams(p);
    describe({ data: { params: p, origin: window.location.origin } })
      .then(setInfo)
      .catch(() =>
        setFailure("Could not read this request. Try connecting again from your AI app."),
      );
  }, [describe]);

  async function decide(approved: boolean) {
    if (!params) return;
    setBusy(true);
    try {
      const data = { params, origin: window.location.origin };
      const { redirectTo } = approved
        ? await approve({ data: { ...data, allowWrite } })
        : await deny({ data });
      window.location.assign(redirectTo);
    } catch {
      setBusy(false);
      setFailure("Something went wrong. Try connecting again from your AI app.");
    }
  }

  const signInHref = () =>
    `/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  const wantsWrite = info?.ok && info.scopes.includes("mcp:write");

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-bg px-5 py-12 font-sora antialiased">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <Radio className="size-5 text-primary" />
          <span>
            Viral4All <span className="text-primary">Ads</span>
          </span>
        </Link>

        {failure || (info && !info.ok) ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Can't connect this app</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {failure ?? (info && !info.ok ? info.description : "")}
            </p>
          </>
        ) : !info || loading ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : !user ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Sign in to continue</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              <strong className="text-foreground">{info.clientName ?? "An AI app"}</strong> wants to
              connect to your Viral4All Ads account.
            </p>
            <a href={signInHref()} className={`${button} mt-8 bg-primary text-primary-foreground`}>
              Sign in
            </a>
          </>
        ) : (
          <>
            <ShieldCheck className="size-7 text-primary" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              Allow {info.clientName ?? "this AI app"} to use your ads?
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Signed in as {user.email} (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="cursor-pointer underline hover:text-foreground"
              >
                use another account
              </button>
              ). You will return to <strong className="text-foreground">{info.redirectHost}</strong>
              .
            </p>
            {hasMeta === false && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
              >
                This account has no Meta ad account connected, so the app will see no ads. Use
                another account, or connect Meta first on the Meta connection page.
              </p>
            )}

            <ul className="mt-6 space-y-3 text-sm">
              <li className="rounded-lg border border-border p-3">
                <p className="font-medium">Read your ads</p>
                <p className="text-muted-foreground">Ad accounts, ads, spend and results.</p>
              </li>
              {wantsWrite && (
                <li className="rounded-lg border border-border p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={allowWrite}
                      onChange={(e) => setAllowWrite(e.target.checked)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="font-medium">Make changes</span>
                      <span className="block text-muted-foreground">
                        Pause ads and prepare budget, resume and creative changes. Those only run
                        after you approve each one on this site.
                      </span>
                    </span>
                  </label>
                </li>
              )}
            </ul>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(false)}
                className={`${button} border border-border hover:bg-muted`}
              >
                Deny
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(true)}
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              >
                {busy ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Allow"}
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              You can disconnect it any time on the API keys page.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
