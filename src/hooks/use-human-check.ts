import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, type RefObject } from "react";
import { verifyHuman } from "@/lib/turnstile.functions";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
function loadTurnstile() {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile ("I'm not a robot"). Invisible for most people; it only shows a box in
 * `el` when Cloudflare wants a click. `check()` resolves true when the server accepts the token,
 * and always true when no site key is configured.
 */
export function useHumanCheck(siteKey: string | null, el: RefObject<HTMLDivElement | null>) {
  const verifyFn = useServerFn(verifyHuman);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((t: string | null) => void)[]>([]);

  useEffect(() => {
    if (!siteKey) return;
    let gone = false;
    const settle = (t: string | null) => {
      token.current = t;
      if (t) waiting.current.splice(0).forEach((w) => w(t));
    };
    loadTurnstile()
      .then(() => {
        if (gone || !el.current || !window.turnstile) return;
        widget.current = window.turnstile.render(el.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          size: "flexible", // full width of the form when it does show
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          callback: settle,
          "expired-callback": () => settle(null),
          // Cloudflare refused this browser: answer waiting checks now instead of after 20 s.
          "error-callback": () => {
            token.current = null;
            waiting.current.splice(0).forEach((w) => w(null));
          },
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, el]);

  return async function check(): Promise<boolean> {
    if (!siteKey) return true;
    const t =
      token.current ??
      (await new Promise<string | null>((resolve) => {
        waiting.current.push(resolve);
        setTimeout(() => resolve(null), 20_000);
      }));
    if (!t) return false;
    // Tokens are single use: get a fresh one ready for the next attempt.
    token.current = null;
    if (widget.current) window.turnstile?.reset(widget.current);
    const { ok } = await verifyFn({ data: { token: t } });
    return ok;
  };
}
