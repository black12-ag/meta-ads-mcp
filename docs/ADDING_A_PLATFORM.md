# Adding a platform (TikTok, Google Ads, X, LinkedIn, ...)

Meta is the only platform that works today. The others (TikTok, Google Ads, X, LinkedIn) are
placeholders in the interface and are not built yet.

There is no plugin system. Adding a platform means following the pattern Meta already uses, file by
file. This guide lists each step and the Meta files to copy from. **Open an issue first** so we can
agree on the plan before you write code. A platform is a big change, and one or two people usually
need to talk it through.

## Before you start

Check what the platform's API allows. You need answers to these:

- **Sign-in:** does it use OAuth 2? What does your own app have to pass (review, verification)?
- **Reading:** can you read campaigns, ads and results?
- **Writing:** can you pause, change a budget or create an ad through the API?
- **Limits:** how many calls can you make, and are tokens short-lived? Do they refresh?
- **Rules:** what does the platform forbid? Follow its terms. Don't scrape, and don't work around its
  limits.

Start with **read-only** (list campaigns, show results). Add changes after that works.

## The steps

### 1. Database (`db/schema.sql`)

Add tables for the connection, its accounts, the mirrored campaigns and ads, and a log of changes.
Copy the pattern of `meta_connections`, `meta_ad_accounts` and `meta_ad_changes`. Use
`CREATE TABLE IF NOT EXISTS` so `npm run db:migrate` stays safe to run again.

Tokens are always stored encrypted. Use `src/lib/db/token-crypto.server.ts`. Never store one in
plain text.

### 2. Connect flow (`src/lib/<platform>/`)

Copy the shape of `src/lib/meta/graph.server.ts` (the sign-in address, the token exchange, a small
API client) and `src/lib/meta/callback.server.ts`. Add the redirect route next to
`src/routes/api/public/meta.callback.ts`. Put the app's id and secret in `.env.example` with a
comment, and read them on the server only.

### 3. Sync

Copy `src/lib/meta/sync.server.ts` (and `mirror.server.ts`): pull accounts, campaigns, ads and
results into your tables. Call it from the scheduler route (`src/routes/api/public/meta.sync.ts`).

### 4. MCP tools (`src/lib/mcp/tools/<platform>.ts`)

Copy `src/lib/mcp/tools/meta.ts`.

- Name every tool with the platform first: `tiktok_list_campaigns`, `tiktok_pause_ads`.
- **Add each tool to `TOOL_SCOPES` in `src/lib/mcp/server.ts`.** A tool that isn't listed there is
  never registered. That is deliberate.
- Register your tools in `buildMcpServer` and add a line about them to its `instructions` text.
- Money is always in minor units (cents).

The same tools are also available as REST calls (`/api/public/v1/tools/<name>`) and in the CLI, with
no extra work.

### 5. Safety: limits and approvals

This is the part that needs the most care, and it is why people trust this project.

- **Reads** run straight away.
- Pausing, which only stops spend, may run straight away.
- **Anything that raises spend or changes what people see** (resume, budget, creative, targeting)
  must not run on the AI's say-so. It has to go through the approval flow:
  `src/lib/mcp/confirm.server.ts` checks the owner's limits, saves a pending action and returns an
  approval link. The owner confirms on `/approve/$id`.

Today that file understands Meta objects. To add a platform you extend its checks and its action
runner so your platform's changes pass through the same gate. A pull request that lets a change skip
it will not be merged.

### 6. Interface

- `src/lib/platforms.ts`: set `connectorAvailable: true` for your platform.
- `src/lib/platform-marks.tsx`: change its `status` from `"soon"` to `"live"` and check the icon.
- Add a connect card where Meta's is (Settings and Connections) and a source page
  (`src/routes/sources.$id.tsx` already lists the platforms).

### 7. Tests

Add `tests/<platform>/`, like `tests/meta/` and `tests/mcp/`. Test the limits and approval rules
the most, and anything that handles money or tokens.

### 8. Docs

Add the platform to the table in the [README](../README.md), and say plainly what works and what
doesn't.

## Checklist for your pull request

- [ ] Reads work, and changes go through approvals
- [ ] Every new tool is in `TOOL_SCOPES`
- [ ] Tokens are stored encrypted, and no secret is in the code
- [ ] Tests for limits, approvals and any money logic
- [ ] `npm test` and `npm run lint` show nothing new
- [ ] README table updated
