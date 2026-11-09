import { createFileRoute } from "@tanstack/react-router";

/** RFC 9116: where to report a vulnerability. Expires must stay in the future; renew yearly. */
const BODY = [
  "Contact: mailto:support@viral4all.com",
  "Expires: 2027-10-22T00:00:00.000Z",
  "Preferred-Languages: en",
  "Canonical: https://ads.viral4all.com/.well-known/security.txt",
  "Policy: https://ads.viral4all.com/support#security",
  "",
].join("\n");

export const Route = createFileRoute("/.well-known/security.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(BODY, { headers: { "content-type": "text/plain; charset=utf-8" } }),
    },
  },
});
