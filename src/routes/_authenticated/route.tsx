import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSession } from "@/hooks/use-session";

/**
 * Signed-in pages. The sign-in check runs in the component, not in beforeLoad, so the page's
 * code downloads while Firebase restores the session instead of after it (a whole round trip
 * saved on slow connections). Only a UX gate: every server function checks the token itself.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Gate,
});

function Gate() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });

  // Once only: the address changes as soon as the redirect starts, and re-firing would wrap
  // /auth?next=… inside itself forever.
  const sent = useRef(false);
  useEffect(() => {
    if (loading || user || sent.current) return;
    sent.current = true;
    navigate({ to: "/auth", search: { next: href }, replace: true });
  }, [loading, user, navigate, href]);

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  return <Outlet />;
}
