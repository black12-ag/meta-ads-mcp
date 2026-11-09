import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Bot, Copy, KeyRound, Loader2, Terminal, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ConnectedApps } from "@/components/ConnectedApps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createKey, listKeys, revokeKey, setKeyScopes } from "@/lib/api-keys.functions";
import { API_SCOPES, DEFAULT_SCOPES, scopeLabel, type ApiScope } from "@/lib/api-scopes";

export const Route = createFileRoute("/_authenticated/api-keys")({
  head: () => ({
    meta: [
      { title: "API keys & CLI — Viral4All Ads" },
      {
        name: "description",
        content:
          "Create API keys so your AI assistant or CLI can create, update, pause and resume Meta ads without opening Meta.",
      },
      { property: "og:title", content: "API keys & CLI — Viral4All Ads" },
      {
        property: "og:description",
        content: "Headless control of your Meta ads through a simple REST API and CLI commands.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiKeysPage,
});

/** The three ways to drive this account from outside the dashboard. */
function accessMethods(origin: string, key: string) {
  const base = origin || "https://ads.viral4all.com";
  return [
    {
      id: "mcp",
      icon: Bot,
      title: "AI agents (MCP)",
      blurb:
        "Claude, Claude Code, Cursor, ChatGPT or n8n. One endpoint gives the assistant all 14 tools, scoped to this key.",
      blocks: [
        {
          label: "Claude Desktop or Cursor: add to the MCP config file",
          code: JSON.stringify(
            {
              mcpServers: {
                "viral4all-ads": {
                  url: `${base}/mcp`,
                  headers: { Authorization: `Bearer ${key}` },
                },
              },
            },
            null,
            2,
          ),
        },
        {
          label: "Claude Code: one command",
          code: `claude mcp add --transport http viral4all-ads ${base}/mcp \\
  --header "Authorization: Bearer ${key}"`,
        },
      ],
    },
    {
      id: "api",
      icon: Webhook,
      title: "REST API",
      blurb:
        "Plain HTTP for scripts, n8n, Zapier or your own backend. Every call is scope-checked and written to the audit log.",
      blocks: [
        {
          label: "List every ad with its metrics",
          code: `curl -s "${base}/api/public/v1/ads?date_preset=last_30d" \\
  -H "Authorization: Bearer ${key}"`,
        },
        {
          label: "Pause or resume, one ad or many",
          code: `curl -s -X POST ${base}/api/public/v1/ads/status \\
  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
  -d '{"ids":["1203...","1204..."],"action":"pause"}'`,
        },
        {
          label: "Change a budget (cents)",
          code: `curl -s -X POST ${base}/api/public/v1/ads/budget \\
  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
  -d '{"objectId":"1203...","kind":"daily","budgetMinorUnits":2500}'`,
        },
        {
          label: "Swap the destination link or creative",
          code: `curl -s -X POST ${base}/api/public/v1/ads/creative \\
  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
  -d '{"adId":"1203...","destination":"whatsapp","destinationValue":"+251912345678"}'`,
        },
        {
          label: "Upload media from a URL, then launch a paused campaign",
          code: `curl -s -X POST ${base}/api/public/v1/media \\
  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
  -d '{"url":"https://cdn.example.com/promo.mp4"}'\n\ncurl -s -X POST ${base}/api/public/v1/ads \\
  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
  -d '{"name":"Spring promo","budgetMinorUnits":2000,"countries":["ET"],\n       "destinationValue":"https://example.com","headline":"Spring sale",\n       "primaryText":"30% off this week"}'`,
        },
      ],
    },
    {
      id: "cli",
      icon: Terminal,
      title: "Terminal (CLI)",
      blurb:
        "Save the key once in your shell, then run short commands. Works on any machine with curl.",
      blocks: [
        {
          label: "Save the key and the address once",
          code: `echo 'export VIRAL4ALL_ADS_KEY="${key}"' >> ~/.zshrc\necho 'export VIRAL4ALL_ADS_URL="${base}"' >> ~/.zshrc\nsource ~/.zshrc`,
        },
        {
          label: "Everyday commands",
          code: `# what is running right now\ncurl -s "$VIRAL4ALL_ADS_URL/api/public/v1/ads?date_preset=today" \\
  -H "Authorization: Bearer $VIRAL4ALL_ADS_KEY" | jq '.ads[] | {adName, spend: .insights.spend, running}'\n\n# pull fresh numbers from Meta\ncurl -s -X POST "$VIRAL4ALL_ADS_URL/api/public/v1/sync" \\
  -H "Authorization: Bearer $VIRAL4ALL_ADS_KEY"\n\n# pause one ad\ncurl -s -X POST "$VIRAL4ALL_ADS_URL/api/public/v1/ads/status" \\
  -H "Authorization: Bearer $VIRAL4ALL_ADS_KEY" -H "Content-Type: application/json" \\
  -d '{"ids":["AD_ID"],"action":"pause"}'`,
        },
      ],
    },
  ];
}

function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_SCOPES);

  const toggleScope = (value: ApiScope) =>
    setScopes((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );

  const fetchKeys = useServerFn(listKeys);
  const addKey = useServerFn(createKey);
  const killKey = useServerFn(revokeKey);

  const keysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => fetchKeys({}),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => addKey({ data: { name: name.trim() || "CLI key", scopes } }),
    onSuccess: (data) => {
      setFresh(data.key);
      setName("");
      toast.success("Key created. Copy it now: it won't be shown again.");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editScopes = useServerFn(setKeyScopes);
  const scopesMutation = useMutation({
    mutationFn: (vars: { id: string; scopes: string[] }) => editScopes({ data: vars }),
    onSuccess: () => {
      toast.success("Permissions updated");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => killKey({ data: { id } }),
    onSuccess: () => {
      toast.success("Key revoked");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <AppShell title="API keys">
      <div className="space-y-8">
        <section className="panel p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="text-[13px] text-foreground">Key name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Claude desktop, deploy bot, my laptop…"
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-2 transition-transform hover:-translate-y-0.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Create key
            </Button>
          </div>

          <div className="mt-4">
            <p className="text-xs text-muted-foreground font-medium">Permissions for this key</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {API_SCOPES.map((s) => (
                <label
                  key={s.value}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 transition-colors hover:border-primary/40"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.value)}
                    onChange={() => toggleScope(s.value)}
                    className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className="block text-xs text-foreground">{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{s.description}</span>
                    <code className="font-mono text-[10px] text-muted-foreground">{s.value}</code>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              A key can only call the endpoints you tick here.
            </p>
          </div>

          {fresh ? (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Copy this now. We only keep a hash of it.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-nav-button px-3 py-2 font-mono text-xs text-foreground">
                  {fresh}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(fresh)} className="gap-1.5">
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Your keys</h2>
          {keysQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {(keysQuery.data ?? []).map((k: any) => (
            <div
              key={k.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-3 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="text-sm text-foreground">{k.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {k.revoked_at
                  ? "revoked"
                  : k.last_used_at
                    ? `last used ${new Date(k.last_used_at).toLocaleString()}`
                    : "never used"}
              </p>
              <div className="flex w-full flex-wrap gap-1.5 order-last">
                {API_SCOPES.map((s) => {
                  const on = (k.scopes ?? []).includes(s.value);
                  return (
                    <button
                      key={s.value}
                      disabled={Boolean(k.revoked_at) || scopesMutation.isPending}
                      title={s.description}
                      onClick={() =>
                        scopesMutation.mutate({
                          id: k.id,
                          scopes: on
                            ? (k.scopes ?? []).filter((v: string) => v !== s.value)
                            : [...(k.scopes ?? []), s.value],
                        })
                      }
                      className={`inline-flex h-6 items-center rounded-md border px-2 text-xs transition-colors disabled:opacity-50 ${
                        on
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {scopeLabel(s.value)}
                    </button>
                  );
                })}
              </div>
              {!k.revoked_at ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(k.id)}
                >
                  <Trash2 className="size-3.5" /> Revoke
                </Button>
              ) : null}
            </div>
          ))}
          {keysQuery.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              Couldn't load your keys. {(keysQuery.error as Error).message}
            </p>
          ) : !keysQuery.isLoading && !(keysQuery.data ?? []).length ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No keys yet. Create one to control your ads from anywhere.
            </p>
          ) : null}
        </section>

        <ConnectedApps />

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Three ways to use a key</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {fresh
                ? "The snippets below already contain the key you just created."
                : "Create a key above and these snippets will fill themselves in. Until then they show a placeholder."}
            </p>
          </div>

          {accessMethods(origin, fresh ?? "sk_meta_YOUR_KEY").map((m) => (
            <div key={m.id} className="panel p-5">
              <div className="flex items-start gap-3">
                <m.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{m.title}</p>
                  <p className="mt-1 max-w-xl text-xs text-muted-foreground">{m.blurb}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {m.blocks.map((b) => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground">{b.label}</p>
                      <button
                        onClick={() => copy(b.code)}
                        className="text-xs text-muted-foreground transition-colors hover:text-primary"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="mt-1.5 overflow-x-auto rounded bg-nav-button p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {b.code}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[11px] text-muted-foreground">
            Same key, same permissions. Every call is logged.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
