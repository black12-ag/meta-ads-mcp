import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const PROMPTS = [
  "How did my ads do this week?",
  "Which ad sets are wasting money?",
  "Pause anything under 1 ROAS.",
  "Move budget to my best ad set.",
];

/** A prompt you copy into Claude, ChatGPT or Cursor; your AI does the rest. */
export function CopyPrompt({ text, className }: { text: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast.success("Copied. Paste it into your AI."),
          () => toast.error("Couldn't copy. Select the text and copy it yourself."),
        )
      }
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent",
        className,
      )}
    >
      “{text}”
      <Copy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Copy</span>
    </button>
  );
}

/** Home: things to ask your AI, one click to copy. */
export function AskAiPrompts() {
  return (
    <section aria-label="Ask your AI" className="mt-8">
      <h2 className="text-[15px] font-semibold">Ask your AI</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <CopyPrompt key={p} text={p} />
        ))}
      </div>
    </section>
  );
}
