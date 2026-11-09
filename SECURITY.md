# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately:

- GitHub: **Security → Report a vulnerability** on this repository, or
- Email: support@viral4all.com

Include what you found, how to reproduce it, and what it could affect. We read every report and reply
as soon as we can. This is a small project, so we can't promise a fixed time.

## What matters most here

- Meta access tokens (stored encrypted) and the `TOKEN_ENCRYPTION_KEY`
- The MCP and API sign-in, and the scopes on each tool
- The limits and approvals that protect ad spend (anything that lets an AI or API key change a
  budget or an ad without the owner's approval)
- Server secrets reaching the browser

## Supported versions

Only the latest commit on the main branch gets fixes.
