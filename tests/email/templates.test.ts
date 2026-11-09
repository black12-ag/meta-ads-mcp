import { expect, test } from "vitest";
import {
  SITE,
  accountAlerts,
  aiAppConnected,
  approvalRequested,
  changeApplied,
  escapeHtml,
  metaNeedsReconnect,
  welcome,
  type Email,
} from "@/lib/email/templates";

const EVIL = `<script>alert("x")</script> & 'quoted' <img src=x onerror=alert(1)>`;

test("escapeHtml escapes tags, quotes and ampersands", () => {
  expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
    "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
  );
  expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  expect(escapeHtml(null)).toBe("");
  expect(escapeHtml(30)).toBe("30");
});

const request = `${SITE}/approve/6f1c2d3e-0000-4000-8000-000000000001`;

// Every template, with hostile text wherever users or Meta supply a value.
const cases: [string, Email, string, boolean][] = [
  [
    "approvalRequested",
    approvalRequested({
      requester: EVIL,
      actionTitle: EVIL,
      headline: EVIL,
      approveUrl: request,
      expiresInMinutes: 30,
    }),
    request,
    true,
  ],
  [
    "changeApplied ok",
    changeApplied({ headline: EVIL, ok: true, requestUrl: request }),
    request,
    true,
  ],
  [
    "changeApplied failed",
    changeApplied({ headline: EVIL, ok: false, error: EVIL, requestUrl: request }),
    request,
    true,
  ],
  ["welcome", welcome(), `${SITE}/dashboard`, false],
  ["aiAppConnected", aiAppConnected({ appName: EVIL, canWrite: true }), `${SITE}/api-keys`, true],
  ["metaNeedsReconnect", metaNeedsReconnect({ reason: EVIL }), `${SITE}/connections`, true],
  [
    "accountAlerts",
    accountAlerts({
      accountName: EVIL,
      findings: [{ kind: "ctr_drop", severity: "warn", title: EVIL, detail: EVIL }],
    }),
    `${SITE}/dashboard`,
    true,
  ],
  [
    "accountAlerts with a pause request",
    accountAlerts({
      accountName: EVIL,
      findings: [{ kind: "monthly_budget", severity: "critical", title: EVIL, detail: EVIL }],
      pauseRequested: true,
    }),
    `${SITE}/approvals`,
    true,
  ],
];

test.each(cases)("%s: every part, the right link, no raw input", (_, email, url, hasInput) => {
  for (const part of [email.subject, email.preheader, email.text, email.html]) {
    expect(part.trim().length).toBeGreaterThan(0);
  }
  expect(email.subject).not.toMatch(/[\r\n]/);

  expect(email.html).toContain(`href="${url}"`);
  expect(email.text).toContain(url);
  const hrefs = [...email.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) expect(href.startsWith(`${SITE}/`), href).toBe(true);

  // hidden preheader, and the same footer in both parts
  expect(email.html).toContain(escapeHtml(email.preheader));
  for (const part of [email.html, email.text]) {
    expect(part).toContain("You get this because you have a Viral4All Ads account.");
    expect(part).toContain("support@viral4all.com");
    expect(part).toContain(`${SITE}/dashboard`);
  }

  expect(email.html).not.toContain("<script");
  expect(email.html).not.toContain("<img");
  expect(email.html).not.toContain(`"x"`);
  if (hasInput) expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

test("approval email says nothing changes until approved, and when it expires", () => {
  const email = approvalRequested({
    requester: "your AI assistant",
    actionTitle: "Change a budget",
    headline: "ShegerPay — Traffic: daily budget $1.00 → $25.00",
    approveUrl: request,
    expiresInMinutes: 30,
  });
  expect(email.subject).toBe("Approval needed: Change a budget");
  expect(email.text).toContain("Your AI assistant asked to make this change");
  expect(email.text).toContain("ShegerPay — Traffic: daily budget $1.00 → $25.00");
  expect(email.text).toContain("Nothing changes until you approve it.");
  expect(email.text).toContain("expires in 30 minutes");
  expect(email.html).toContain("Review and approve");
});

test("a failed change shows Meta's error", () => {
  const email = changeApplied({
    headline: "Ad A: new image",
    ok: false,
    error: "(#100) Invalid image hash",
    requestUrl: request,
  });
  expect(email.subject).toBe("Change failed: Ad A: new image");
  expect(email.text).toContain("(#100) Invalid image hash");
});

test("welcome lists the MCP URL; app notice names the access level on one subject line", () => {
  expect(welcome().text).toContain(`${SITE}/mcp`);
  const email = aiAppConnected({ appName: "Evil\nBcc: x@example.com", canWrite: false });
  expect(email.subject).toBe("Evil Bcc: x@example.com was connected to your account");
  expect(email.text).toContain("with read only access");
  expect(email.text).toContain(`Not you? Disconnect it: ${SITE}/api-keys`);
  expect(aiAppConnected({ appName: "Claude", canWrite: true }).text).toContain(
    "with read and make changes access",
  );
});

test("account alerts list every finding, mark urgent ones and link the pause request", () => {
  const email = accountAlerts({
    accountName: "ShegerPay",
    findings: [
      {
        kind: "monthly_budget",
        severity: "critical",
        title: "Monthly budget used up",
        detail: "$1,020.00 of your $1,000.00 monthly budget is spent.",
      },
      {
        kind: "ctr_drop",
        severity: "warn",
        title: "Click-through rate dropped",
        detail: "Yesterday's click-through rate was 0.80%.",
      },
    ],
    pauseRequested: true,
  });
  expect(email.subject).toBe("ShegerPay: Monthly budget used up and 1 more");
  expect(email.preheader).toBe("$1,020.00 of your $1,000.00 monthly budget is spent.");
  expect(email.text).toContain(
    "- Urgent: Monthly budget used up: $1,020.00 of your $1,000.00 monthly budget is spent.",
  );
  expect(email.text).toContain(
    "- Click-through rate dropped: Yesterday's click-through rate was 0.80%.",
  );
  expect(email.text).toContain("Nothing changes until you approve it.");
  expect(email.text).toContain(`Review the pause request: ${SITE}/approvals`);
});
