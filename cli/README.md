# viral4all-ads

Run [Viral4All Ads](https://ads.viral4all.com), the Meta Ads control room, from your terminal. It has the same tools as the MCP server at `https://ads.viral4all.com/mcp`, so terminal agents (Claude Code, Codex, Gemini CLI) and scripts can use them. It needs Node 18 or newer and has no dependencies.

## Install and run

Run it without installing:

```sh
npx -y viral4all-ads login
```

Or install the `viral4all-ads` command:

```sh
npm i -g viral4all-ads
viral4all-ads login
```

It's also served from our site, if npm is blocked where you are: `npx -y https://ads.viral4all.com/cli/viral4all-ads.tgz login`.

## Sign in

| Command                                 | What it does                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `viral4all-ads login`                   | Opens your browser. Sign in and approve. The CLI saves the sign-in and renews it itself.                      |
| `viral4all-ads login --read-only`       | The same, with read access only.                                                                              |
| `viral4all-ads login --key sk_meta_...` | Uses an API key from https://ads.viral4all.com/api-keys instead. The key's scopes decide which tools you get. |
| `viral4all-ads whoami`                  | Shows the server, sign-in type and scope.                                                                     |
| `viral4all-ads logout`                  | Forgets the saved sign-in.                                                                                    |

Browser sign-in comes back to `http://127.0.0.1:<port>`, so run `login` on the computer with the browser. On a server or in CI, use an API key.

The sign-in is saved with mode 0600 in `$XDG_CONFIG_HOME/viral4all-ads/config.json`. That's `~/.config/viral4all-ads/config.json` by default, and `%APPDATA%\viral4all-ads\config.json` on Windows.

## Examples

```sh
viral4all-ads tools                                  # the tools you can use
viral4all-ads help meta_set_budget                   # one tool's options
viral4all-ads ads --date-preset last_7d --only-running
viral4all-ads pause 120210000000001 120210000000002  # runs at once
viral4all-ads budget 120210000000003 2500            # 25.00 a day, once you approve
viral4all-ads budget 120210000000003 90000 --kind lifetime
viral4all-ads status <confirm_token>                 # outcome of an approval
viral4all-ads call meta_list_ads --input '{"datePreset":"today"}'
echo '{"ids":["120210000000001"]}' | viral4all-ads call meta_pause_ads -
```

Every tool works with `call <tool>`. Its options come from the tool's input schema:

- `--name value` or `--name=value`. Kebab case works too: `--date-preset` sets `datePreset`.
- `--flag` for true, `--flag=false` for false.
- Lists: repeat the option, or separate values with commas.
- Objects: pass JSON.
- `--input '<json>'` gives all options at once, and `-` reads that JSON from stdin. Other options override it.

Shortcuts:

| Shortcut                                                 | Tool                  |
| -------------------------------------------------------- | --------------------- |
| `ads`                                                    | `meta_list_ads`       |
| `campaigns`                                              | `meta_list_campaigns` |
| `insights`                                               | `meta_get_insights`   |
| `accounts`                                               | `meta_list_accounts`  |
| `pause <ids...>`                                         | `meta_pause_ads`      |
| `resume <ids...>`                                        | `meta_resume_ads`     |
| `budget <objectId> <budgetMinorUnits> [--kind lifetime]` | `meta_set_budget`     |
| `status <confirm_token>`                                 | `meta_confirm_action` |
| `sync`                                                   | `meta_sync_now`       |
| `activity`                                               | `meta_activity_log`   |

Budgets are in minor units (cents), as on the server.

## Approvals and limits

Budgets, resumes, creative and ad set edits return an approval link; pauses run at once; your limits apply.

When a change needs approval, the CLI prints:

```
Approval needed: open https://ads.viral4all.com/approve/<id> — nothing changes until you approve.
```

Open the link, check the change and press Approve. Then `viral4all-ads status <confirm_token>` shows the outcome. The server enforces the limits you set on the Goals & limits page, so a request outside them is refused.

## Environment

| Variable            | Use                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `VIRAL4ALL_API_KEY` | An API key to use instead of the saved sign-in, for example in CI.                         |
| `VIRAL4ALL_SERVER`  | The server. Default `https://ads.viral4all.com`. `--server <url>` sets it for one command. |

## Use from agents

Add `--json` for machine output: compact JSON on stdout and nothing else. Messages and errors go to stderr.

| Exit code | Meaning                                            |
| --------- | -------------------------------------------------- |
| 0         | OK                                                 |
| 1         | The tool failed. The message says why.             |
| 2         | Usage error: unknown command, tool or option.      |
| 3         | Not signed in, or the server rejected the sign-in. |

`tools --json` and `help <tool> --json` give each tool's description and input schema. A tool your sign-in can't use isn't listed.

To hand it to an agent, sign in once yourself, then tell the agent: "Use `viral4all-ads` with `--json` for my Meta ads. Run `viral4all-ads tools --json` first."
