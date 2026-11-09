---
name: safe-budget-change
description: Changes a Meta campaign or ad set budget safely through the Viral4All Ads connector. Checks the owner's hard limits first, requests the change, shows the owner's approval link and confirms the outcome. Use when the user wants to raise, lower, double, scale up, scale down or set a daily or lifetime budget.
---

# Safe budget change

## Steps

1. Find the object and its current budget with `meta_list_campaigns`; it shows whether the campaign or its ad sets hold the budget. Change it where it lives: the campaign if the campaign has a budget, otherwise the ad set. Read `goals_and_limits` from `meta_list_ads`.
2. Work out the new budget in minor units and check it against the limits before asking:
   - a daily budget must be at or under the max daily budget;
   - a raise can't be more than the max raise %: new ≤ old × (1 + max% ÷ 100);
   - the object and its campaign must not be in `protected_ids`.

   If it breaks a limit, name the limit and offer the largest amount that fits. Go on only with the user's yes.

3. If the raise is over 20%, mention that big jumps can restart Meta's learning phase, and that steps of about 20% a few days apart scale more smoothly. Let the user decide.
4. Call `meta_set_budget` with the object id, `kind` (`daily` or `lifetime`) and `budgetMinorUnits`.
5. Reply in this shape, with the link in full:

   > Budget for **Spring sale**: $20.00 → $25.00 a day (+25%). Nothing has changed yet.
   > Approve it here: https://ads.viral4all.com/approve/… (the link expires in 30 minutes)

6. When the user says they've approved, or asks, call `meta_confirm_action` with the `confirm_token`:

   | Status                 | Tell the user                                                             |
   | ---------------------- | ------------------------------------------------------------------------- |
   | `waiting_for_approval` | Not approved yet; show the link again                                     |
   | `done`                 | The new budget as read back from Meta; the owner can undo it on that page |
   | `rejected`             | Rejected, with the owner's note; don't ask again unless the user wants to |
   | `failed`               | Meta's error, in plain words                                              |
   | `undone`               | The owner reversed it                                                     |
   | Expired error          | The request lapsed; offer to ask again                                    |

## Rules

- Uses the Viral4All Ads connector (`meta_*` tools). If they're missing, ask the user to add the connector `https://ads.viral4all.com/mcp`, then stop. If Meta isn't connected, give the link from `meta_connection_status`.
- Money is in minor units: 2500 is 25.00 in a two-decimal currency such as USD (zero-decimal currencies such as JPY have no cents). Show amounts in the account currency; send minor units back.
- `meta_pause_ads` stops spend at once. First list what will stop (name, id, spend) and wait for a clear yes. Pause only those ids.
- `meta_resume_ads`, `meta_set_budget`, `meta_update_creative`, `meta_update_adset` and `meta_archive` change nothing on their own. Every time, show the user the summary and the full `approve_url`, and say when it expires.
- A change has happened only when `meta_confirm_action` returns `done`. Until then it is waiting for approval. Report `rejected` (with the owner's note), `failed` (with the error) and expired requests plainly. After `done`, the owner can undo it on the same approval page, except an archive.
- "Blocked by your limits: …" is final. Quote the reason, explain it in one line, and stop. Never split, repeat or reroute a change (such as editing an ad set inside a protected campaign) to get past a limit. Only the owner changes limits, at https://ads.viral4all.com/limits. Two reasons have a fix: "one ad account at a time" (send one request per account) and "isn't synced yet" (run `meta_sync_now`, then ask once more).
- Write for a busy owner: plain words, short sentences, compact tables. Explain any Meta term in a few words.
