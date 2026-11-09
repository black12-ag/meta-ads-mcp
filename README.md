<p align="center">
  <img src="public/brand/v4-rise-192.png" alt="Viral4All Ads" width="96" height="96">
</p>

<h1 align="center">Viral4All Ads</h1>

<p align="center">
  The Meta Ads control room for you and your AI. Manage Facebook and Instagram ads from a dashboard,
  an MCP server or a REST API, with limits and approvals on every change.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue"></a>
  <img alt="Node 22" src="https://img.shields.io/badge/node-22-339933">
  <img alt="PostgreSQL 13+" src="https://img.shields.io/badge/postgres-13%2B-336791">
</p>

<p align="center">
  <a href="https://ads.viral4all.com">Hosted version</a> ·
  <a href="https://ads.viral4all.com/docs">Docs</a> ·
  <a href="https://github.com/black12-ag/viral4all-ads-selfhost/issues">Issues</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a>
</p>

Connect a Meta account, then manage your ads from the dashboard, from an AI assistant (Claude,
ChatGPT, Cursor) or from a script.

Every change an AI or API key asks for is checked against limits you set (highest daily budget,
biggest raise, changes per day, protected campaigns). Anything above them waits on an approval page
until you confirm it.

**Don't want to host it?** Use the [hosted version](https://ads.viral4all.com). This repository is
the self-hosted edition: you run the server, the database and your own Meta app.

## What you get

- Dashboard: campaigns, ad sets, ads, results, analytics, a saved-ads library
- MCP server at `/mcp` (OAuth sign-in, per-tool scopes) and a REST API at `/api/public/v1`
- Limits and approvals on every AI or API change, with an activity log
- Alerts by email, webhooks, and a command-line client in `cli/`

## What you need

|                                 |                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Node 22 and PostgreSQL 13+      | to run it                                                                           |
| A public HTTPS address          | Meta only redirects back to HTTPS addresses (localhost is allowed while developing) |
| A Firebase project              | for sign-in only; the free plan is enough                                           |
| A Meta app                      | your own, from https://developers.facebook.com                                      |
| Resend account (optional)       | for email alerts                                                                    |
| Cloudflare Turnstile (optional) | "I'm not a robot" on the sign-in page                                               |

## Quick start

```sh
git clone <this repo> viral4all-ads && cd viral4all-ads
npm install
createdb viral4all_ads
cp .env.example .env.local     # fill it in, see below
DATABASE_URL=postgresql://127.0.0.1:5432/viral4all_ads npm run db:migrate
npm run dev                    # http://localhost:3000
```

`.env.local` is git-ignored. Never commit it.

### 1. Make your secrets

```sh
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY (encrypts stored Meta tokens; keep it safe)
openssl rand -hex 24   # CREATIVE_URL_SECRET, META_WEBHOOK_VERIFY_TOKEN, META_SYNC_CRON_SECRET (one each)
```

### 2. Firebase (sign-in)

1. Create a project at https://console.firebase.google.com.
2. Authentication → Sign-in method → turn on **Email/Password** and **Google**.
3. Authentication → Settings → Authorized domains → add your domain.
4. Project settings → add a **Web app** and copy its config into `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
5. Set `FIREBASE_PROJECT_ID` to the same project id. The server checks sign-in tokens itself, so you
   don't need a service-account file.

### 3. Meta app

1. https://developers.facebook.com → **Create app** → use case **Create & manage ads with Marketing
   API**.
2. Add **Facebook Login** (or Facebook Login for Business) and set the **Valid OAuth Redirect URI**
   to `https://YOUR-DOMAIN/api/public/meta/callback`.
3. Settings → Basic: copy the App ID and App Secret into `META_APP_ID` and `META_APP_SECRET`. Add a
   privacy policy URL (`https://YOUR-DOMAIN/privacy`) and a data deletion URL
   (`https://YOUR-DOMAIN/api/public/meta/data-deletion`).
4. The app asks for these permissions: `ads_management`, `ads_read`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_ads`, `business_management`.
5. Set `PUBLIC_BASE_URL=https://YOUR-DOMAIN`.

**Development mode.** A new Meta app starts in development mode. In that mode only people with a role
on the app (you, plus testers you add under **App roles**) can connect, and reading and managing
existing ads works. Meta refuses to create new ad creatives until the app is switched to **Live**.
To manage ad accounts that belong to other people you also need Meta's App Review and business
verification. Meta changes these rules, so check their current documentation before you promise
anything to your users.

### 4. Run it for real

```sh
npm run build
npm start                       # serves on HOST:PORT (default 127.0.0.1:8094)
```

Put it behind an HTTPS reverse proxy (nginx, Caddy). Run `npm start` under systemd or Docker, with
the same variables as `.env.local` in its environment.

Meta data is synced by a scheduler you set up. Every 30 minutes, call:

```sh
curl -X POST https://YOUR-DOMAIN/api/public/meta/sync -H "x-cron-secret: $META_SYNC_CRON_SECRET"
```

### 5. Connect an AI

Open **Connect AI** in the dashboard. It shows your MCP address, `https://YOUR-DOMAIN/mcp`. Add it to
Claude, ChatGPT or Cursor as a custom connector and sign in when asked.

## Commands

| Command                           | What it does                                               |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                     | Development server                                         |
| `npm test`                        | Test suite (needs a local PostgreSQL)                      |
| `npm run db:migrate`              | Applies `db/schema.sql` to `$DATABASE_URL`; safe to re-run |
| `npm run build` / `npm start`     | Production build / run it                                  |
| `npm run lint` / `npm run format` | ESLint / Prettier                                          |
| `npm run check:secrets`           | Fails if a server secret can reach client code             |

## Security

- Meta tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY`. Losing the key makes them unreadable.
- Server secrets never reach the browser (`npm run check:secrets` checks this).
- Found a vulnerability? Please report it privately. See [SECURITY.md](SECURITY.md).

## Contributing

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Please
follow the [code of conduct](CODE_OF_CONDUCT.md). There is no support promise: use
[GitHub issues](https://github.com/black12-ag/viral4all-ads-selfhost/issues) for bugs.

## Support the project

The best way to support it is to use the [hosted version](https://ads.viral4all.com), or tell
someone who runs Meta ads. The **Sponsor** button on this repository links there too.

## Community and contact

- WhatsApp: https://wa.me/message/XAPGDNH6M4HGB1
- Telegram: https://t.me/ethioviral_support
- Facebook: https://www.facebook.com/share/1FUDUaq4z3/
- Instagram: https://www.instagram.com/munir.kab
- TikTok: https://www.tiktok.com/@ethio_viral4
- X: https://x.com/muay01111
- Email: support@viral4all.com

## License and copyright

Copyright (C) 2026 Viral4All Ads authors

This program is free software: you can redistribute it and/or modify it under the terms of the
[GNU Affero General Public License](LICENSE) version 3. It comes with no warranty. If you run a
modified version as a service for other people, you must share your changes under the same license.

The code is free to use and fork. The **Viral4All** name and logo belong to the project: if you
publish a fork or run a public service, please use your own name and logo.

Hosted-only extras of the service at ads.viral4all.com are not part of this repository.
