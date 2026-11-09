import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, Terminal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SKILLS = [
  ["weekly-ads-check", "Weekly check against your goals"],
  ["what-changed", "What changed and why"],
  ["find-wasted-spend", "Find wasted spend"],
  ["launch-campaign", "Launch a campaign, paused"],
  ["safe-budget-change", "Change a budget safely"],
] as const;

export function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }
  return (
    <div className="rounded-xl border border-border bg-background/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <Terminal className="size-3.5 text-primary" /> {label}
        </span>
        <button
          onClick={copy}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {value}
      </pre>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function OneClick({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_hsl(var(--primary))] active:translate-y-0"
    >
      {label} <ExternalLink className="size-3.5" />
    </a>
  );
}

const b = (text: string) => <strong className="font-medium text-foreground">{text}</strong>;

type Client = { id: string; name: string; group: string; body: ReactNode };

function clientsFor(base: string): Client[] {
  const mcp = `${base}/mcp`;
  const cli = "npx -y viral4all-ads";
  const urlConfig = JSON.stringify({ mcpServers: { "viral4all-ads": { url: mcp } } }, null, 2);
  const keyConfig = JSON.stringify(
    {
      mcpServers: {
        "viral4all-ads": { url: mcp, headers: { Authorization: "Bearer sk_meta_YOUR_KEY" } },
      },
    },
    null,
    2,
  );
  const cursor = `cursor://anysphere.cursor-deeplink/mcp/install?name=viral4all-ads&config=${btoa(JSON.stringify({ url: mcp }))}`;
  const vscodeConfig = JSON.stringify({ name: "viral4all-ads", type: "http", url: mcp });
  const skills = (
    <ul className="mt-2 space-y-1 text-sm ">
      {SKILLS.map(([name, label]) => (
        <li key={name}>
          <a className="text-primary underline" href={`${base}/skills/${name}.zip`}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  );

  return [
    {
      id: "claude",
      name: "Claude",
      group: "Chat apps",
      body: (
        <>
          <Steps
            items={[
              <>
                Open {b("Settings → Connectors")} and click {b("Add custom connector")}.
              </>,
              <>Name it Viral4All Ads, paste the URL below and click {b("Add")}.</>,
              <>Click {b("Connect")}, sign in here and choose read-only or read-and-change.</>,
              <>It works in Claude on the web, desktop and phone with the same account.</>,
            ]}
          />
          <CopyBlock label="Server URL" value={mcp} />
          <p className="mt-4 text-sm text-muted-foreground">
            Optional: add our ready-made workflows in {b("Settings → Capabilities → Skills")}{" "}
            (upload each zip):
          </p>
          {skills}
        </>
      ),
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      group: "Chat apps",
      body: (
        <>
          <Steps
            items={[
              <>
                Open {b("Settings → Apps & Connectors → Advanced settings")} and turn on{" "}
                {b("Developer mode")} (paid plans; on Business, an admin may need to allow it).
              </>,
              <>
                Click {b("Create")}, name it Viral4All Ads, paste the URL below and choose{" "}
                {b("OAuth")}.
              </>,
              <>Tick that you trust the app, click {b("Create")}, then sign in here.</>,
              <>In a chat, pick Viral4All Ads from the tools menu (+).</>,
            ]}
          />
          <CopyBlock label="Server URL" value={mcp} />
          <p className="mt-4 text-sm text-muted-foreground">
            Building a custom GPT instead? Under {b("Actions")}, import the schema from the URL
            below and set authentication to {b("API key → Bearer")} with a key from the{" "}
            <Link to="/api-keys" className="text-primary underline">
              API keys
            </Link>{" "}
            page.
          </p>
          <div className="mt-3">
            <CopyBlock label="OpenAPI schema URL" value={`${base}/api/public/v1/openapi.json`} />
          </div>
        </>
      ),
    },
    {
      id: "claude-code",
      name: "Claude Code",
      group: "Coding agents",
      body: (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Easiest: install the plugin. It adds the connector plus five workflows (weekly check,
            what changed, wasted spend, launch a campaign, safe budget change).
          </p>
          <CopyBlock
            label="Plugin (run inside Claude Code)"
            value={`/plugin marketplace add ${base}/claude/marketplace.json\n/plugin install viral4all-ads@viral4all`}
          />
          <p className="my-3 text-sm text-muted-foreground">
            Or just the connector, then run {b("/mcp")} in Claude Code to sign in:
          </p>
          <CopyBlock
            label="Terminal"
            value={`claude mcp add --transport http viral4all-ads ${mcp}`}
          />
        </>
      ),
    },
    {
      id: "codex",
      name: "Codex",
      group: "Coding agents",
      body: (
        <>
          <Steps
            items={[
              <>Add the server, then sign in when your browser opens.</>,
              <>Works in the Codex CLI and the IDE extension (they share the config).</>,
            ]}
          />
          <CopyBlock
            label="Terminal"
            value={`codex mcp add viral4all-ads --url ${mcp}\ncodex mcp login viral4all-ads`}
          />
        </>
      ),
    },
    {
      id: "gemini",
      name: "Gemini CLI",
      group: "Coding agents",
      body: (
        <>
          <Steps
            items={[
              <>Add the server from your terminal.</>,
              <>
                Start Gemini CLI and run {b("/mcp auth viral4all-ads")} to sign in in your browser.
              </>,
            ]}
          />
          <CopyBlock
            label="Terminal"
            value={`gemini mcp add --transport http --scope user viral4all-ads ${mcp}`}
          />
        </>
      ),
    },
    {
      id: "cursor",
      name: "Cursor",
      group: "Coding agents",
      body: (
        <>
          <OneClick href={cursor} label="Add to Cursor" />
          <p className="mb-3 text-sm text-muted-foreground">
            Cursor asks you to sign in the first time a tool runs. Or add it to{" "}
            {b("~/.cursor/mcp.json")} yourself:
          </p>
          <CopyBlock label="mcp.json" value={urlConfig} />
        </>
      ),
    },
    {
      id: "vscode",
      name: "VS Code",
      group: "Coding agents",
      body: (
        <>
          <OneClick
            href={`vscode:mcp/install?${encodeURIComponent(vscodeConfig)}`}
            label="Add to VS Code"
          />
          <p className="mb-3 text-sm text-muted-foreground">
            Then use it from Copilot Chat in agent mode. From a terminal instead:
          </p>
          <CopyBlock label="Terminal" value={`code --add-mcp '${vscodeConfig}'`} />
        </>
      ),
    },
    {
      id: "windsurf",
      name: "Windsurf",
      group: "Coding agents",
      body: (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Add this to {b("~/.codeium/windsurf/mcp_config.json")} and refresh the MCP list.
          </p>
          <CopyBlock
            label="mcp_config.json"
            value={JSON.stringify({ mcpServers: { "viral4all-ads": { serverUrl: mcp } } }, null, 2)}
          />
        </>
      ),
    },
    {
      id: "cli",
      name: "Terminal & scripts",
      group: "Automation",
      body: (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            The CLI signs in once in your browser, then any script or terminal agent can use every
            tool. Add {b("--json")} for machine output.
          </p>
          <CopyBlock
            label="Terminal"
            value={`${cli} login\n${cli} ads\n${cli} insights --level campaign --breakdowns age\n${cli} tools`}
          />
        </>
      ),
    },
    {
      id: "api",
      name: "Zapier, Make, n8n & API",
      group: "Automation",
      body: (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Every tool is also a plain HTTP endpoint. Make a key on the{" "}
            <Link to="/api-keys" className="text-primary underline">
              API keys
            </Link>{" "}
            page, then import the OpenAPI schema or call it directly. Changes that spend money still
            come back as an approval link.
          </p>
          <div className="space-y-3">
            <CopyBlock label="OpenAPI schema" value={`${base}/api/public/v1/openapi.json`} />
            <CopyBlock
              label="Example"
              value={`curl -X POST ${base}/api/public/v1/tools/meta_get_insights \\\n  -H "Authorization: Bearer sk_meta_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"level":"campaign","datePreset":"last_7d"}'`}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Want your tools told when something happens (approval waiting, change applied, alert)?
            Add a{" "}
            <Link to="/webhooks" className="text-primary underline">
              webhook
            </Link>
            . n8n can also use the MCP URL with its MCP Client node and an API key.
          </p>
        </>
      ),
    },
    {
      id: "other",
      name: "Any other AI app",
      group: "Automation",
      body: (
        <>
          <Steps
            items={[
              <>Apps that support sign-in: paste the server URL and sign in when asked.</>,
              <>Apps without sign-in: send an API key in the Authorization header.</>,
              <>Apps that only run local servers: bridge with {b("npx -y mcp-remote")}.</>,
              <>
                AI agents can read{" "}
                <a className="text-primary underline" href={`${base}/llms.txt`}>
                  /llms.txt
                </a>{" "}
                to learn how to connect by themselves.
              </>,
            ]}
          />
          <div className="space-y-3">
            <CopyBlock label="Server URL" value={mcp} />
            <CopyBlock label="With an API key" value={keyConfig} />
            <CopyBlock label="Local bridge" value={`npx -y mcp-remote ${mcp}`} />
          </div>
        </>
      ),
    },
  ];
}

/** App picker plus the chosen app's connect steps. Shared by /setup and the public /connect page. */
export function ConnectGuide() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const clients = clientsFor(origin || "https://ads.viral4all.com");
  const [picked, setPicked] = useState("claude");
  const client = clients.find((c) => c.id === picked) ?? clients[0];
  const groups = [...new Set(clients.map((c) => c.group))];

  return (
    <>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{group}</p>
            <div className="flex flex-wrap gap-2">
              {clients
                .filter((c) => c.group === group)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setPicked(c.id)}
                    aria-pressed={c.id === client.id}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                      c.id === client.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div key={client.id} className="mt-6 border-t border-border pt-5">
        <h3 className="mb-3 text-sm font-semibold">{client.name}</h3>
        {client.body}
      </div>
    </>
  );
}

const TROUBLE: { q: string; a: ReactNode }[] = [
  {
    q: "The sign-in window loops or closes",
    a: (
      <>
        Desktop and terminal apps open your default browser, so sign in there. Allow pop-ups for
        your AI app and for ads.viral4all.com, and avoid private windows or strict tracking
        protection: they can drop your sign-in. Finish by clicking {b("Allow")}. Still looping? Sign
        in at ads.viral4all.com in the same browser first, then click Connect in your AI app again.
      </>
    ),
  },
  {
    q: "“Tool … not found”, or a missing permission",
    a: (
      <>
        Your AI app only sees the tools its sign-in or API key allows. Signed in read-only? The
        tools that make changes are hidden. Disconnect the app under {b("Connected AI apps")} on the{" "}
        <Link to="/api-keys">API keys</Link> page, connect again and tick {b("Make changes")}. Using
        an API key? Switch the missing permission on for that key on the same page. The REST API's
        error names the permission it needs.
      </>
    ),
  },
  {
    q: "“Blocked by your limits: …”",
    a: (
      <>
        The change would break a limit you set: the highest daily budget, the biggest raise, AI
        changes per day, or a protected campaign. Your AI can't change your limits. If you do want
        the change, adjust them on <Link to="/limits">Goals & limits</Link> and ask again.
      </>
    ),
  },
  {
    q: "The approval link expired",
    a: "Approval links last 30 minutes. Nothing changes when one expires. Ask your AI app for the change again and approve the new link.",
  },
  {
    q: "“No Meta account connected”",
    a: (
      <>
        Your AI app is signed in, but your Viral4All Ads account has no Meta login. Connect one on
        the <Link to="/connections">Meta connection</Link> page, pick an ad account, then ask again.
      </>
    ),
  },
  {
    q: "“… isn't synced yet”",
    a: (
      <>
        You have protected campaigns, and your AI asked to change something we haven't copied from
        Meta yet, so we can't check it against them. Click {b("Sync now")} on the{" "}
        <Link to="/dashboard">Overview</Link> page, then ask again.
      </>
    ),
  },
  {
    q: "Disconnect an AI app or revoke an API key",
    a: (
      <>
        Open the <Link to="/api-keys">API keys</Link> page. Under {b("Connected AI apps")}, click
        Disconnect next to the app. Under {b("Your keys")}, click Revoke. Either one stops working
        at once.
      </>
    ),
  },
  {
    q: "Company networks and proxies",
    a: (
      <>
        Claude and ChatGPT reach us from their own servers, so on a company network only the sign-in
        page has to open. Coding agents, the CLI and scripts connect from your computer, so your
        proxy or firewall must allow HTTPS to ads.viral4all.com. If it inspects HTTPS, Node.js tools
        such as our CLI and mcp-remote also need your company's root certificate in{" "}
        {b("NODE_EXTRA_CA_CERTS")}. A script that gets Cloudflare error 1010 should send a
        User-Agent header.
      </>
    ),
  },
];

/** Fixes for the problems people hit most, shared by /connect and /docs. */
export function Troubleshooting({ className }: { className?: string }) {
  return (
    <div
      className={cn("panel divide-y divide-border [&_a]:text-primary [&_a]:underline", className)}
    >
      {TROUBLE.map((t) => (
        <div key={t.q} className="p-6">
          <h3 className="text-sm font-semibold">{t.q}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.a}</p>
        </div>
      ))}
    </div>
  );
}
