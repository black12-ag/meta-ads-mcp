import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { CopyPrompt, PROMPTS } from "@/components/AskAiPrompts";
import { Button } from "@/components/ui/button";
import { getOnboarding } from "@/lib/onboarding.functions";
import { cn } from "@/lib/utils";

type State = { meta: boolean; account: boolean; ai: boolean; asked: boolean };

// Three steps to first value. Connecting Meta and picking an account happen on one page.
const STEPS = [
  {
    title: "Connect Meta",
    time: "1 min",
    text: "Sign in with Facebook and pick your ad account.",
    done: (s: State) => s.meta && s.account,
    to: "/connections",
  },
  {
    title: "Connect your AI",
    time: "1 min",
    text: "Add one URL to Claude, ChatGPT or Cursor.",
    done: (s: State) => s.ai,
    to: "/setup",
  },
  {
    title: "Ask it something",
    time: "10 sec",
    text: "Paste this into your AI. It does the rest.",
    done: (s: State) => s.asked,
    to: null,
  },
] as const;

/** Home setup steps; gone once all three are done. */
export function GettingStarted() {
  const fetchState = useServerFn(getOnboarding);
  const state = useQuery({ queryKey: ["onboarding"], queryFn: () => fetchState({}), retry: false });
  if (!state.data) return null;

  const done = STEPS.map((s) => s.done(state.data));
  const left = done.filter((d) => !d).length;
  if (!left) return null;
  const next = done.indexOf(false);

  return (
    <section className="panel mb-8 p-5" aria-label="Get set up">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Get set up</h2>
        <span className="text-xs text-muted-foreground">
          {left} {left === 1 ? "step" : "steps"} left
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
        {/* scaleX instead of width: transform-only, no layout work */}
        <motion.div
          className="h-full origin-left rounded-full bg-primary"
          initial={false}
          animate={{ scaleX: (STEPS.length - left) / STEPS.length }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className={cn(
              "flex flex-col rounded-lg border p-4",
              i === next ? "border-primary/40 bg-primary/5" : "border-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    done[i]
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground",
                  )}
                >
                  {done[i] ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.title}
              </span>
              <span className="text-xs text-muted-foreground">{s.time}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            <div className="mt-auto pt-4">
              {done[i] ? (
                <span className="text-xs font-semibold text-success">Done</span>
              ) : s.to ? (
                <Button asChild size="sm" variant={i === next ? "default" : "outline"}>
                  <Link to={s.to}>Connect</Link>
                </Button>
              ) : (
                <CopyPrompt text={PROMPTS[0]} />
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
