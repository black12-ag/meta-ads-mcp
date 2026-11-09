# Viral4All Ads

Run your Meta (Facebook and Instagram) ads from Claude while a person stays in charge of the money. The plugin connects Claude to the Viral4All Ads connector and adds five skills: a weekly check, a change history, a wasted-spend hunt, a campaign launch and a safe budget change.

Viral4All Ads is an independent service. It is not made or endorsed by Meta.

## What it does

- Reports ad performance: spend, results, cost per result, reach, frequency, clicks and return on ad spend, by campaign, ad set or ad, with breakdowns by age, gender, country, placement and device.
- Lists your ad accounts, campaigns, ad sets, ads, custom audiences and recent changes.
- Searches Meta interests and locations for targeting.
- Pauses ads, ad sets or campaigns. A pause takes effect at once; the skills list what will stop and wait for your yes.
- Creates new campaigns, and copies of existing ones, as paused, so nothing spends until they are started.

## Approvals and limits

Some changes never run from the chat: resuming ads, changing a budget, editing an ad's link or creative, editing an ad set's targeting, schedule or bid, and archiving. For these, Claude gets a link to ads.viral4all.com. The change runs only after the account owner signs in there and presses Approve. Links expire after 30 minutes, and the owner can undo an approved change on the same page, except an archive.

On the Goals & limits page, the owner sets hard limits for each ad account: the highest daily budget, the biggest raise per change, how many AI changes a day, and campaigns the AI may not touch. The server checks them when Claude asks and again at approval, so a request outside the limits is refused whatever the prompt says.

## Install

You need a Viral4All Ads account at https://ads.viral4all.com with a Meta ad account connected.

- **From Anthropic's directory:** add Viral4All Ads, then sign in when Claude asks.
- **In Claude Code** (2.1.224 or later): run `/plugin marketplace add https://ads.viral4all.com/claude/marketplace.json`, then `/plugin install viral4all-ads@viral4all`, then sign in with `/mcp`.

Sign-in uses OAuth on ads.viral4all.com. On the consent screen you choose whether Claude may only read your ads, or also make changes. You can disconnect it any time on the API keys page.

## Skills

| Skill                | What it does                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `weekly-ads-check`   | Compares the last 7 days with the 7 before, against your goals and limits, and proposes next steps. |
| `what-changed`       | Explains recent approvals and edits, and the spend and result shifts that followed.                 |
| `find-wasted-spend`  | Finds spend with no or poor results, and proposes pauses or budget cuts.                            |
| `launch-campaign`    | Builds a new campaign paused, then offers to start it with an approval link.                        |
| `safe-budget-change` | Requests a budget change inside your limits, then confirms the outcome.                             |

## What the plugin runs and sends

The plugin holds five skills, which are instructions only, and one remote MCP server: https://ads.viral4all.com/mcp. It runs no local code, hooks or scripts and installs no packages.

Tool calls go over HTTPS to Viral4All Ads, which reads and changes your Meta ads through the Meta Marketing API, using the Meta login you connected on ads.viral4all.com. Viral4All Ads records each tool call (the tool name and its inputs) in your account's audit log, so you can see what the AI did. It doesn't receive your conversation.

## Privacy and support

- Privacy policy: https://ads.viral4all.com/privacy
- Terms of service: https://ads.viral4all.com/terms
- Help: https://ads.viral4all.com/support or support@viral4all.com

## License

MIT, see [LICENSE](LICENSE). The license covers the files in this plugin, not the Viral4All Ads service.
