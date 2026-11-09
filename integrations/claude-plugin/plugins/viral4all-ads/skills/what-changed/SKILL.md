---
name: what-changed
description: Explains what changed in a Meta ads account through the Viral4All Ads connector, covering AI change requests (waiting, approved, rejected, failed or undone), edits made in Meta Ads Manager or elsewhere, and the spend and results shifts that followed. Use when the user asks what changed, who changed something, what the AI did, or why spend, results or costs suddenly moved.
---

# What changed

## Steps

1. Take the window from the user ("since Monday", "yesterday"); default to the last 7 days.
2. Call `meta_sync_now` so edits made outside Viral4All (for example in Meta Ads Manager) are picked up. It spends nothing.
3. Call `meta_activity_log` (raise `limit` for long windows) and keep what falls inside the window: change requests (status, who asked, the owner's note) and the ad changes the sync detected (field, from, to, when).
4. Call `meta_get_insights` with `level: "campaign"` and `daily: true` over the window plus the same number of days before it. Find the campaigns whose daily spend, results or cost per result moved most, and the day each move started.
5. Link a move to a change only when the dates line up, and say "likely", not "because". After a big edit Meta re-learns for a few days, so swings right after it are normal.
6. If a request is still waiting for approval, say so and show its approval link.

## Output

A one-line summary of the biggest change and its likely effect. Then the timeline, newest first:

| When       | What changed                       | Who or where                  | Since then                       |
| ---------- | ---------------------------------- | ----------------------------- | -------------------------------- |
| Tue 14 Oct | Spring sale budget $20 → $30 a day | AI request, approved by owner | Spend +45%, cost per result flat |

"Who or where" is either an AI request with its status, or "seen by the sync" (made in Meta Ads Manager or another tool). Then the biggest movers:

| Campaign | Spend per day (before → after) | Results per day (before → after) | Cost per result (before → after) |
| -------- | ------------------------------ | -------------------------------- | -------------------------------- |

## Rules

- Uses the Viral4All Ads connector (`meta_*` tools). If they're missing, ask the user to add the connector `https://ads.viral4all.com/mcp`, then stop. If Meta isn't connected, give the link from `meta_connection_status`.
- Money is in minor units: 2500 is 25.00 in a two-decimal currency such as USD (zero-decimal currencies such as JPY have no cents). Show amounts in the account currency; send minor units back.
- `meta_pause_ads` stops spend at once. First list what will stop (name, id, spend) and wait for a clear yes. Pause only those ids.
- `meta_resume_ads`, `meta_set_budget`, `meta_update_creative`, `meta_update_adset` and `meta_archive` change nothing on their own. Every time, show the user the summary and the full `approve_url`, and say when it expires.
- A change has happened only when `meta_confirm_action` returns `done`. Until then it is waiting for approval. Report `rejected` (with the owner's note), `failed` (with the error) and expired requests plainly. After `done`, the owner can undo it on the same approval page, except an archive.
- "Blocked by your limits: …" is final. Quote the reason, explain it in one line, and stop. Never split, repeat or reroute a change (such as editing an ad set inside a protected campaign) to get past a limit. Only the owner changes limits, at https://ads.viral4all.com/limits. Two reasons have a fix: "one ad account at a time" (send one request per account) and "isn't synced yet" (run `meta_sync_now`, then ask once more).
- Write for a busy owner: plain words, short sentences, compact tables. Explain any Meta term in a few words.
