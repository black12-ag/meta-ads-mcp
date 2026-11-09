#!/usr/bin/env node
import { parseToolArgs, typeOf } from "../lib/args.mjs";
import { configPath, LOGIN_HINT, removeConfig, session, writeConfig } from "../lib/config.mjs";
import { CliError } from "../lib/errors.mjs";
import { connect, toolOutput } from "../lib/mcp.mjs";
import { login } from "../lib/oauth.mjs";

const HELP = `viral4all-ads: Viral4All Ads (Meta Ads control room) in your terminal.
Same tools as the MCP server at https://ads.viral4all.com/mcp.

Sign in
  login                      Sign in with your browser (--read-only for read access only)
  login --key sk_meta_...    Use an API key from https://ads.viral4all.com/api-keys
  whoami                     Server, sign-in type and scope
  logout                     Forget the saved sign-in

Tools
  tools                      List the tools you can use
  help <tool>                A tool's options
  call <tool> [--option value ...] [--input '<json>' | -]

Shortcuts
  ads                        meta_list_ads
  campaigns                  meta_list_campaigns
  insights                   meta_get_insights
  accounts                   meta_list_accounts
  pause <ids...>             meta_pause_ads: pauses at once
  resume <ids...>            meta_resume_ads: needs your approval
  budget <objectId> <budgetMinorUnits> [--kind lifetime]
                             meta_set_budget: needs your approval
  status <confirm_token>     meta_confirm_action: outcome of an approval
  sync                       meta_sync_now
  activity                   meta_activity_log

Options
  --json                     Machine output: compact JSON only
  --server <url>             Default https://ads.viral4all.com (or VIRAL4ALL_SERVER)
  VIRAL4ALL_API_KEY=...      Use this API key instead of the saved sign-in

Examples
  viral4all-ads login
  viral4all-ads ads --date-preset last_7d --only-running
  viral4all-ads pause 120210000000001 120210000000002
  viral4all-ads budget 120210000000003 2500     # 25.00 a day, once you approve
  viral4all-ads call meta_list_ads --input '{"datePreset":"today"}' --json

Exit codes: 0 ok, 1 tool error, 2 usage error, 3 auth error.`;

/** Shortcut -> [tool, ...positional parameters]. */
const ALIASES = {
  ads: ["meta_list_ads"],
  campaigns: ["meta_list_campaigns"],
  insights: ["meta_get_insights"],
  accounts: ["meta_list_accounts"],
  pause: ["meta_pause_ads", "ids"],
  resume: ["meta_resume_ads", "ids"],
  budget: ["meta_set_budget", "objectId", "budgetMinorUnits"],
  status: ["meta_confirm_action", "confirm_token"],
  sync: ["meta_sync_now"],
  activity: ["meta_activity_log"],
};

function takeFlag(argv, ...names) {
  const i = argv.findIndex((word) => names.includes(word));
  if (i >= 0) argv.splice(i, 1);
  return i >= 0;
}

function takeOption(argv, name) {
  const i = argv.findIndex((word) => word === name || word.startsWith(`${name}=`));
  if (i < 0) return undefined;
  const [word] = argv.splice(i, 1);
  const value = word === name ? argv.splice(i, 1)[0] : word.slice(name.length + 1);
  if (!value) throw new CliError(`${name} needs a value.`, 2);
  return value;
}

const mask = (key) => `${key.slice(0, Math.min(16, Math.floor(key.length / 2)))}…`;

const print = (value, json) =>
  console.log(
    !json && typeof value === "string" ? value : JSON.stringify(value, null, json ? 0 : 2),
  );

async function findTool(client, name, server) {
  const tool = (await client.listTools()).find((t) => t.name === name);
  if (tool) return tool;
  throw new CliError(
    `${name} is not available on ${server} for this sign-in: the server does not have it, or your access does not include it. Run \`viral4all-ads tools\` to see yours.`,
    2,
  );
}

function toolHelp(tool) {
  const schema = tool.inputSchema ?? {};
  const label = (p) =>
    p?.enum?.join("|") ??
    (typeOf(p) === "array" ? `${label(p.items)},...` : (typeOf(p) ?? "value"));
  const rows = Object.entries(schema.properties ?? {}).map(([key, p]) => [
    typeOf(p) === "boolean" ? `--${key}[=false]` : `--${key} <${label(p)}>`,
    [
      schema.required?.includes(key) && "required",
      p.default !== undefined && `default ${JSON.stringify(p.default)}`,
      p.description,
    ]
      .filter(Boolean)
      .join(". "),
  ]);
  const width = Math.max(0, ...rows.map(([flag]) => flag.length));
  const lines = [`${tool.name}: ${tool.description ?? ""}`, ""];
  lines.push(`Usage: viral4all-ads call ${tool.name} [options]`);
  const alias = Object.keys(ALIASES).find((a) => ALIASES[a][0] === tool.name);
  if (alias) {
    const words = [alias, ...ALIASES[alias].slice(1).map((p) => `<${p}>`), "[options]"];
    lines.push(`       viral4all-ads ${words.join(" ")}`);
  }
  if (rows.length)
    lines.push("", "Options:", ...rows.map(([f, d]) => `  ${f.padEnd(width)}  ${d}`));
  lines.push("", "Or give the options as JSON: --input '<json>', or - to read it from stdin.");
  return lines.join("\n");
}

async function runTool(s, name, words, positional, json) {
  const client = connect(s);
  const tool = await findTool(client, name, s.server);
  let input;
  try {
    input = parseToolArgs(words, tool.inputSchema, { positional });
  } catch (err) {
    if (err.exitCode === 2) err.message += ` Run \`viral4all-ads help ${name}\` for its options.`;
    throw err;
  }
  const output = toolOutput(await client.callTool(name, input));
  print(output, json);
  if (!json && output?.approve_url) {
    console.error(
      `\nApproval needed: open ${output.approve_url} — nothing changes until you approve.`,
    );
  }
}

async function main(argv) {
  const json = takeFlag(argv, "--json");
  const help = takeFlag(argv, "--help", "-h");
  const server = takeOption(argv, "--server");
  const [command = "help", ...rest] = argv;
  // The tool a command is about: a shortcut, `call <tool>` or `help <tool or shortcut>`.
  const alias = ALIASES[command === "help" ? rest[0] : command];
  const toolName = alias?.[0] ?? (command === "call" || command === "help" ? rest[0] : undefined);

  if (help || command === "help") {
    if (!toolName) return console.log(HELP);
    const s = session(server);
    const tool = await findTool(connect(s), toolName, s.server);
    return json ? print(tool, true) : console.log(toolHelp(tool));
  }

  const s = session(server);
  switch (command) {
    case "login": {
      const key = takeOption(rest, "--key");
      const readOnly = takeFlag(rest, "--read-only");
      if (rest.length) {
        throw new CliError("login takes --key <sk_meta_...>, --read-only and --server <url>.", 2);
      }
      if (key !== undefined) {
        if (!key.startsWith("sk_meta_")) {
          throw new CliError(
            `API keys start with sk_meta_. Create one at ${s.server}/api-keys.`,
            2,
          );
        }
        writeConfig({ server: s.server, type: "key", key });
        return console.error(`Saved API key ${mask(key)} for ${s.server}.`);
      }
      const config = await login({ server: s.server, readOnly });
      writeConfig(config);
      return console.error(`Signed in to ${s.server} (scope: ${config.scope ?? "unknown"}).`);
    }
    case "logout":
      removeConfig();
      return console.error("Signed out: the saved sign-in is removed.");
    case "whoami":
      if (!s.type) throw new CliError(`Not signed in to ${s.server}. ${LOGIN_HINT}`, 3);
      return print(
        {
          server: s.server,
          auth: s.type === "key" ? "api key" : "oauth",
          ...(s.type === "key"
            ? { key: mask(s.key), scope: `set on the key at ${s.server}/api-keys` }
            : { scope: s.scope }),
          from: s.fromEnv ? "VIRAL4ALL_API_KEY" : configPath(),
        },
        json,
      );
    case "tools": {
      const tools = await connect(s).listTools();
      if (json) return print(tools, true);
      if (!tools.length) return console.error("No tools are available to this sign-in.");
      const width = Math.max(...tools.map((t) => t.name.length));
      for (const t of tools) {
        console.log(`${t.name.padEnd(width)}  ${(t.description ?? "").split(/(?<=\.)\s/)[0]}`);
      }
      return console.log("\nRun `viral4all-ads help <tool>` for a tool's options.");
    }
    case "call":
      if (!toolName) {
        throw new CliError("Usage: viral4all-ads call <tool> [--option value ...]", 2);
      }
      return runTool(s, toolName, rest.slice(1), [], json);
    default:
      if (!alias)
        throw new CliError(`Unknown command "${command}". Run \`viral4all-ads --help\`.`, 2);
      return runTool(s, alias[0], rest, alias.slice(1), json);
  }
}

main(process.argv.slice(2)).catch((err) => {
  const cause = err.cause?.message ? ` (${err.cause.message})` : "";
  console.error(`viral4all-ads: ${err.message}${cause}`);
  process.exitCode = err.exitCode ?? 1;
});
