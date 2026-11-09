---
name: weekly-ads-check
description: Weekly health check of Meta (Facebook and Instagram) ads through the Viral4All Ads connector. Compares the last 7 days with the 7 days before against the owner's goals and limits, shows one short table and proposes next steps. Use when the user asks how their ads are doing, wants a weekly or regular report or performance review, or asks whether anything needs changing.
---

# Weekly ads check

## Steps

1. Call `meta_list_ads` with `datePreset: "last_7d"`. Note the currency and `goals_and_limits`: target cost per result, monthly budget, max daily budget, max raise %, protected ids and owner notes. If the user means another ad account, find it with `meta_list_accounts`, say which one you're switching to, and call `meta_switch_account`.
2. Call `meta_get_insights` with `level: "campaign"` twice, using `since` and `until` (YYYY-MM-DD): this week is 7 days ago to yesterday; last week is 14 days ago to 8 days ago.
3. If a monthly budget is set, call `meta_get_insights` with `level: "account"` from the first day of the budget month (`budget_month_starts_on_day`) to today, and project the month's spend at the current daily rate.
4. Flag campaigns that:
   - spent at least one target cost per result and got no results;
   - cost more than 20% over the target per result, or got 20% worse than last week;
   - show a frequency above 3 for the week (the same people keep seeing the ad);
   - sit at or near the max daily budget limit.

   With no target set, compare each campaign with the account average and suggest the owner set a target on Goals & limits.

5. Propose up to 3 actions, biggest money impact first. Tag each **Direct** (pause) or **Needs approval** (budget, resume, ad or targeting edit). Do nothing until the user picks one, then follow the Rules.

## Output

A one-line verdict, then up to 8 campaigns by spend (group the rest as "Other"):

| Campaign    | Spend (vs last week) | Results (vs last week) | Cost per result (target) | Flag        |
| ----------- | -------------------- | ---------------------- | ------------------------ | ----------- |
| Spring sale | $210 (+18%)          | 42 (+5%)               | $5.00 ($4.00)            | Over target |

Then one line on the monthly budget pace (if a monthly budget is set) and the numbered actions.

## Rules

- Uses the Viral4All Ads connector (`meta_*` tools). If they're missing, ask the user to add the connector `https://ads.viral4all.com/mcp`, then stop. If Meta isn't connected, give the link from `meta_connection_status`.
- Money is in minor units: 2500 is 25.00 in a two-decimal currency such as USD (zero-decimal currencies such as JPY have no cents). Show amounts in the account currency; send minor units back.
- `meta_pause_ads` stops spend at once. First list what will stop (name, id, spend) and wait for a clear yes. Pause only those ids.
- `meta_resume_ads`, `meta_set_budget`, `meta_update_creative`, `meta_update_adset` and `meta_archive` change nothing on their own. Every time, show the user the summary and the full `approve_url`, and say when it expires.
- A change has happened only when `meta_confirm_action` returns `done`. Until then it is waiting for approval. Report `rejected` (with the owner's note), `failed` (with the error) and expired requests plainly. After `done`, the owner can undo it on the same approval page, except an archive.
- "Blocked by your limits: …" is final. Quote the reason, explain it in one line, and stop. Never split, repeat or reroute a change (such as editing an ad set inside a protected campaign) to get past a limit. Only the owner changes limits, at https://ads.viral4all.com/limits. Two reasons have a fix: "one ad account at a time" (send one request per account) and "isn't synced yet" (run `meta_sync_now`, then ask once more).
- Write for a busy owner: plain words, short sentences, compact tables. Explain any Meta term in a few words.
