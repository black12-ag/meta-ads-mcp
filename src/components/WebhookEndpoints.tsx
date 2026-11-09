import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Loader2, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  testWebhook,
  updateWebhook,
} from "@/lib/webhooks.functions";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";

const ALL_EVENTS = WEBHOOK_EVENTS.map((e) => e.value);
const eventLabel = (v: string) => WEBHOOK_EVENTS.find((e) => e.value === v)?.label ?? v;

const ago = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
};

/** Webhooks page: send our events to the owner's own tools (Slack, Discord, n8n, Zapier…). */
export function WebhookEndpoints() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listWebhooks);
  const createFn = useServerFn(createWebhook);
  const updateFn = useServerFn(updateWebhook);
  const deleteFn = useServerFn(deleteWebhook);
  const testFn = useServerFn(testWebhook);
  const hooks = useQuery({ queryKey: ["webhook-endpoints"], queryFn: () => listFn({}) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["webhook-endpoints"] });

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(ALL_EVENTS);
  const [secret, setSecret] = useState<string | null>(null);

  const adding = useMutation({
    mutationFn: () => createFn({ data: { url, events } }),
    onSuccess: (out) => {
      if (out.error !== null) {
        toast.error(out.error);
        return;
      }
      setSecret(out.secret);
      setUrl("");
      toast.success("Webhook added. Copy its signing secret now.");
      void refresh();
    },
    onError: () => toast.error("Couldn't add the webhook. Try again."),
  });
  const testing = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: (r) =>
      r.ok
        ? toast.success(`Delivered. Your tool answered ${r.status}.`)
        : toast.error(`Not delivered: ${r.error}`),
    onError: () => toast.error("Couldn't send the test. Try again."),
    onSettled: refresh,
  });
  const toggling = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => updateFn({ data: v }),
    onSuccess: (_, v) => toast.success(v.active ? "Resumed." : "Paused. It gets no events now."),
    onError: () => toast.error("Couldn't change it. Try again."),
    onSettled: refresh,
  });
  const deleting = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => toast.success("Webhook deleted."),
    onError: () => toast.error("Couldn't delete it. Try again."),
    onSettled: refresh,
  });

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  };
  const list = hooks.data ?? [];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Send events to your tools</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Get a message when an AI change needs you, an alert fires or a limit blocks a request.
          Works with Slack, Discord, n8n, Zapier and Make.
        </p>
      </div>

      {hooks.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      {list.length ? (
        <ul className="space-y-2">
          {list.map((h) => (
            <li key={h.id} className="panel flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-foreground">{h.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {h.events.map(eventLabel).join(" · ")}
                </p>
                <p className="mt-1 text-xs">
                  {h.active ? null : <span className="text-warning">Paused · </span>}
                  {!h.last_delivery_at ? (
                    <span className="text-muted-foreground">No deliveries yet.</span>
                  ) : h.last_error ? (
                    <span className="text-destructive">
                      Failed {ago(h.last_delivery_at)}: {h.last_error}
                    </span>
                  ) : (
                    <span className="text-success">
                      Delivered {ago(h.last_delivery_at)} (HTTP {h.last_status})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing.isPending}
                  onClick={() => testing.mutate(h.id)}
                >
                  {testing.isPending && testing.variables === h.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}{" "}
                  Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggling.isPending}
                  onClick={() => toggling.mutate({ id: h.id, active: !h.active })}
                >
                  {h.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{" "}
                  {h.active ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting.isPending}
                  onClick={() => {
                    if (confirm("Delete this webhook? It stops getting events right away.")) {
                      deleting.mutate(h.id);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {hooks.isSuccess && !list.length ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No webhooks yet. Add your first one below.
        </p>
      ) : null}

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          adding.mutate();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Webhook URL</span>
          <Input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
          />
          <span className="block text-xs text-muted-foreground">
            Must start with https://. Slack and Discord webhook links get a readable message;
            anything else gets JSON.
          </span>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Events to send</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev.value} className="flex items-start gap-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={events.includes(ev.value)}
                  onCheckedChange={(on) =>
                    setEvents((cur) =>
                      on === true ? [...cur, ev.value] : cur.filter((v) => v !== ev.value),
                    )
                  }
                />
                <span>
                  <span className="block text-foreground">{ev.label}</span>
                  <span className="block text-xs text-muted-foreground">{ev.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={adding.isPending || !url.trim() || !events.length}>
          {adding.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}{" "}
          Add webhook
        </Button>

        {secret ? (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              Signing secret. Copy it now: we won't show it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-nav-button px-3 py-2 font-mono text-xs text-foreground">
                {secret}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={() => copy(secret)}>
                <Copy className="size-3.5" /> Copy
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              To verify a message, compute the hex HMAC-SHA256 of{" "}
              <code className="font-mono">t + "." + raw body</code> with this secret as the key and
              compare it with <code className="font-mono">v1</code>; both are in the{" "}
              <code className="font-mono">X-Viral4All-Signature</code> header.
            </p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
