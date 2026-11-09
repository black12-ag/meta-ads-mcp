---
name: launch-campaign
description: Launches a new Meta (Facebook and Instagram) campaign through the Viral4All Ads connector. Gathers the goal, audience, a budget inside the owner's limits and the creative, creates everything paused, then offers to start it through an owner approval link. Use when the user wants to create, launch, set up or start a new ad or campaign, or promote a product, page, offer or WhatsApp number.
---

# Launch a campaign

## Steps

1. Call `meta_connection_status`; if Meta isn't connected, give the connect link and stop. Call `meta_list_ads` for the currency and `goals_and_limits` (max daily budget, owner notes).
2. Ask in one short message for whatever is missing:
   - **Goal:** website visits (traffic), engagement or awareness.
   - **Destination:** website URL, WhatsApp number, Facebook Page or Messenger.
   - **Audience:** countries; optionally ages, genders and interests (look interests and places up with `meta_search_targeting`).
   - **Budget:** per day, or a lifetime total, in the account currency. A daily budget must be at or under the max daily budget; if it's over, give the limit and ask for a lower amount.
   - **Creative:** headline, primary text, call to action, and a public https image or video URL. Offer to write the copy, and get the user's OK on it.
3. For a video, call `meta_upload_media` with its URL and use the returned video id. An image URL can go straight into `meta_create_ad`.
4. Show a recap and ask "Create it paused?":

   | Setting     | Value                                  |
   | ----------- | -------------------------------------- |
   | Name        | Spring sale, US, Oct                   |
   | Goal        | Website visits                         |
   | Destination | https://example.com/sale               |
   | Audience    | US, 25–45, interest: Running           |
   | Budget      | $20.00 a day                           |
   | Ad          | Headline, text, button, image or video |

5. On yes, call `meta_create_ad`. It creates the campaign, ad set and ad PAUSED, so nothing spends. If it has no field for part of the audience (for example interests), apply that next with `meta_update_adset`, which needs approval. Report the new ids.
6. Offer to start it: call `meta_resume_ads` with the campaign id, then show the summary and the approval link. After the user approves, call `meta_confirm_action`. When it's `done`, add that Meta reviews new ads (usually within 24 hours) before they deliver.

## Rules

- Uses the Viral4All Ads connector (`meta_*` tools). If they're missing, ask the user to add the connector `https://ads.viral4all.com/mcp`, then stop. If Meta isn't connected, give the link from `meta_connection_status`.
- Money is in minor units: 2500 is 25.00 in a two-decimal currency such as USD (zero-decimal currencies such as JPY have no cents). Show amounts in the account currency; send minor units back.
- `meta_pause_ads` stops spend at once. First list what will stop (name, id, spend) and wait for a clear yes. Pause only those ids.
- `meta_resume_ads`, `meta_set_budget`, `meta_update_creative`, `meta_update_adset` and `meta_archive` change nothing on their own. Every time, show the user the summary and the full `approve_url`, and say when it expires.
- A change has happened only when `meta_confirm_action` returns `done`. Until then it is waiting for approval. Report `rejected` (with the owner's note), `failed` (with the error) and expired requests plainly. After `done`, the owner can undo it on the same approval page, except an archive.
- "Blocked by your limits: …" is final. Quote the reason, explain it in one line, and stop. Never split, repeat or reroute a change (such as editing an ad set inside a protected campaign) to get past a limit. Only the owner changes limits, at https://ads.viral4all.com/limits. Two reasons have a fix: "one ad account at a time" (send one request per account) and "isn't synced yet" (run `meta_sync_now`, then ask once more).
- Write for a busy owner: plain words, short sentences, compact tables. Explain any Meta term in a few words.
