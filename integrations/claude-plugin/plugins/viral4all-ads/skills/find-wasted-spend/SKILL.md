---
name: find-wasted-spend
description: Finds Meta ad spend that brings no or poor results against the owner's target cost per result, using the Viral4All Ads connector, and proposes pauses (direct, after a clear yes) or budget cuts and targeting edits (owner approval). Use when the user asks where money is wasted, which ads to turn off, how to cut costs or improve return on ad spend, or why cost per result is high.
---

# Find wasted spend

## Steps

1. Call `meta_list_ads` with `datePreset: "last_30d"` and `onlyRunning: true`. Read `target_cost_per_result` and `protected_ids` from `goals_and_limits`. With no target, use the account's median cost per result as the bar and suggest the owner set a target on Goals & limits.
2. Call `meta_get_insights` with `level: "adset"` and `datePreset: "last_7d"` to see whether each problem is still happening. For the worst ad sets, call it again with one breakdown at a time (`age`, `gender`, `country`, `publisher_platform`) to find slices that spend without results.
3. Put each running ad and ad set in one class (T is the target cost per result):

   | Class     | Rule                                               | Proposal                                         |
   | --------- | -------------------------------------------------- | ------------------------------------------------ |
   | Wasted    | Spent 2×T or more with 0 results                   | Pause (direct)                                   |
   | Poor      | Cost per result above 1.5×T, and spent 2×T or more | Cut budget 30–50% or narrow targeting (approval) |
   | Recovered | Bad over 30 days, fine over the last 7             | Leave it; mention it                             |
   | Too early | Spent under T, or started less than 7 days ago     | Leave it; check next week                        |
   | Protected | In `protected_ids`, or inside a protected campaign | Leave it; mention it                             |

4. Show the table below, the total the Wasted rows spent, and roughly what the proposals would save per week.
5. Ask which to do, then:
   - **Pause:** list name, id and spend, get a clear yes, call `meta_pause_ads` with only those ids, and report each result.
   - **Budget cut:** call `meta_set_budget` where the budget lives (the campaign if it has one, otherwise the ad set) and show the approval link.
   - **Targeting:** call `meta_update_adset` (countries, ages, genders, interests) to drop the slices that waste money, and show the approval link. If it can't change placements, tell the user to change them in Meta Ads Manager.
   - Prefer pausing over `meta_archive`, because an archive can't be undone.

## Output

| Ad or ad set | Spend | Results | Cost per result (target) | Class | Proposal |
| ------------ | ----- | ------- | ------------------------ | ----- | -------- |

## Rules

- Uses the Viral4All Ads connector (`meta_*` tools). If they're missing, ask the user to add the connector `https://ads.viral4all.com/mcp`, then stop. If Meta isn't connected, give the link from `meta_connection_status`.
- Money is in minor units: 2500 is 25.00 in a two-decimal currency such as USD (zero-decimal currencies such as JPY have no cents). Show amounts in the account currency; send minor units back.
- `meta_pause_ads` stops spend at once. First list what will stop (name, id, spend) and wait for a clear yes. Pause only those ids.
- `meta_resume_ads`, `meta_set_budget`, `meta_update_creative`, `meta_update_adset` and `meta_archive` change nothing on their own. Every time, show the user the summary and the full `approve_url`, and say when it expires.
- A change has happened only when `meta_confirm_action` returns `done`. Until then it is waiting for approval. Report `rejected` (with the owner's note), `failed` (with the error) and expired requests plainly. After `done`, the owner can undo it on the same approval page, except an archive.
- "Blocked by your limits: …" is final. Quote the reason, explain it in one line, and stop. Never split, repeat or reroute a change (such as editing an ad set inside a protected campaign) to get past a limit. Only the owner changes limits, at https://ads.viral4all.com/limits. Two reasons have a fix: "one ad account at a time" (send one request per account) and "isn't synced yet" (run `meta_sync_now`, then ask once more).
- Write for a busy owner: plain words, short sentences, compact tables. Explain any Meta term in a few words.
