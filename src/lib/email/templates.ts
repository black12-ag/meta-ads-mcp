/**
 * Transactional email templates. Pure and client-safe: no env, no I/O.
 * One 600px table layout with inline styles only, a hidden preheader and a plain-text twin for
 * every email. No images, tracking or attachments, and links only to SITE. Every dynamic value
 * (ad, campaign and app names come from users and Meta) goes through escapeHtml.
 */
import type { Finding } from "@/lib/alerts/rules";

export type EmailKind =
  | "approvalRequested"
  | "changeApplied"
  | "welcome"
  | "aiAppConnected"
  | "metaNeedsReconnect"
  | "accountAlerts";

export type Email = { subject: string; html: string; text: string; preheader: string };

export const SITE = "https://ads.viral4all.com";

const INK = "#141815";
const ACCENT = "#05E901";
const GREEN = "#0a7d07"; // ACCENT is too light for text on white
const MUTED = "#5b625c";
const LINE = "#e3e6e2";
const PAGE = "#f3f4f2";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TEXT = `font-family:${FONT};font-size:15px;line-height:24px;color:${INK};`;

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const para = (html: string) => `<p style="margin:0 0 16px;${TEXT}">${html}</p>`;
const bold = (value: unknown) => `<strong>${escapeHtml(value)}</strong>`;
const small = (value: unknown) =>
  `<span style="font-size:13px;color:${MUTED};">${escapeHtml(value)}</span>`;
const link = (url: string, label: string) =>
  `<a href="${escapeHtml(url)}" style="color:${GREEN};text-decoration:underline;">${escapeHtml(label)}</a>`;
/** Shaded box for the one thing the email is about. */
const box = (html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td style="padding:12px 16px;background-color:#f1f6f0;border-left:3px solid ${ACCENT};${TEXT}">${html}</td></tr></table>`;

type Button = { label: string; url: string };

/** The shared frame. body is trusted HTML: build it only from the escaping helpers above. */
export function layout(e: { preheader: string; heading: string; body: string; button: Button }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(e.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(e.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${LINE};border-radius:8px;">
<tr><td style="height:4px;font-size:0;line-height:0;background-color:${ACCENT};border-radius:8px 8px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:24px 32px 0;font-family:${FONT};font-size:16px;line-height:24px;font-weight:700;color:${INK};">Viral4All <span style="color:${GREEN};">Ads</span></td></tr>
<tr><td style="padding:20px 32px 8px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${INK};">${escapeHtml(e.heading)}</h1>
${e.body}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td bgcolor="${ACCENT}" style="border-radius:6px;background-color:${ACCENT};"><a href="${escapeHtml(e.button.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:${INK};text-decoration:none;border-radius:6px;">${escapeHtml(e.button.label)}</a></td></tr></table>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid ${LINE};font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
You get this because you have a Viral4All Ads account.<br>
Questions? Reply to this email or write to support@viral4all.com.<br>
<a href="${SITE}/dashboard" style="color:${GREEN};text-decoration:underline;">Open your account</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const FOOTER_TEXT = [
  "You get this because you have a Viral4All Ads account.",
  "Questions? Reply to this email or write to support@viral4all.com.",
  `Open your account: ${SITE}/dashboard`,
].join("\n");

function compose(e: {
  subject: string;
  preheader: string;
  heading: string;
  html: string;
  text: string[];
  button: Button;
}): Email {
  return {
    // Names from users and Meta can hold line breaks; a subject must stay one line.
    subject: e.subject.replace(/\s+/g, " ").trim(),
    preheader: e.preheader,
    html: layout({ preheader: e.preheader, heading: e.heading, body: e.html, button: e.button }),
    text: [e.heading, ...e.text, `${e.button.label}: ${e.button.url}`, FOOTER_TEXT].join("\n\n"),
  };
}

/** An AI app asked for a change that spends money or publishes. */
export function approvalRequested(d: {
  requester: string;
  actionTitle: string;
  headline: string;
  approveUrl: string;
  expiresInMinutes: number;
}): Email {
  // requesterLabel() can return "your AI assistant", and it starts a sentence here.
  const who = d.requester.charAt(0).toUpperCase() + d.requester.slice(1);
  const left =
    d.expiresInMinutes >= 120
      ? `${Math.round(d.expiresInMinutes / 60)} hours`
      : `${d.expiresInMinutes} minutes`;
  const wait = `Nothing changes until you approve it. The request expires in ${left}.`;
  return compose({
    subject: `Approval needed: ${d.actionTitle}`,
    preheader: `${who} asked: ${d.headline}. Nothing changes until you approve.`,
    heading: "Approve this change?",
    html:
      para(`${bold(who)} asked to make this change to your Meta ads.`) +
      box(`${small(d.actionTitle)}<br>${bold(d.headline)}`) +
      para(escapeHtml(wait)),
    text: [
      `${who} asked to make this change to your Meta ads.`,
      `${d.actionTitle}\n${d.headline}`,
      wait,
    ],
    button: { label: "Review and approve", url: d.approveUrl },
  });
}

/** Receipt after the owner approved a change: it ran, or Meta refused it. */
export function changeApplied(d: {
  headline: string;
  ok: boolean;
  error?: string | null;
  requestUrl: string;
}): Email {
  const button = { label: "View the request", url: d.requestUrl };
  if (d.ok) {
    const done = "You approved this change and Meta applied it.";
    return compose({
      subject: `Change applied: ${d.headline}`,
      preheader: done,
      heading: "Your change was applied",
      html: box(bold(d.headline)) + para(done),
      text: [d.headline, done],
      button,
    });
  }
  const error = d.error || "No error message was returned.";
  const next = "Open the request for details, or ask your AI to try again.";
  return compose({
    subject: `Change failed: ${d.headline}`,
    preheader: `It failed: ${error}`,
    heading: "Your change did not go through",
    html:
      box(bold(d.headline)) +
      para("You approved this change, but it failed with this error:") +
      para(small(error)) +
      para(next),
    text: [d.headline, "You approved this change, but it failed with this error:", error, next],
    button,
  });
}

const STEPS = [
  ["Connect Meta.", "Open Connections and sign in with Facebook."],
  ["Pick your ad account and Page.", "Choose the ones Viral4All Ads should manage."],
  ["Connect your AI.", `In Claude, ChatGPT or Cursor, add a connector with this URL: ${SITE}/mcp`],
  [
    "Approve your first change.",
    "When your AI asks to spend money or publish, nothing runs until you approve it.",
  ],
];

/** After the first sign-in. */
export function welcome(): Email {
  return compose({
    subject: "Welcome to Viral4All Ads",
    preheader: "Four steps to run your Meta ads from your AI assistant.",
    heading: "Welcome to Viral4All Ads",
    html:
      para("Get set up in four steps:") +
      `<ol style="margin:0 0 16px;padding:0 0 0 22px;${TEXT}">${STEPS.map(
        ([title, detail]) =>
          `<li style="margin:0 0 8px;">${bold(title)} ${escapeHtml(detail)}</li>`,
      ).join("")}</ol>`,
    text: [
      "Get set up in four steps:",
      STEPS.map(([title, detail], i) => `${i + 1}. ${title} ${detail}`).join("\n"),
    ],
    button: { label: "Open your dashboard", url: `${SITE}/dashboard` },
  });
}

/** Security notice: an AI app was granted access over OAuth. */
export function aiAppConnected(d: { appName: string; canWrite: boolean }): Email {
  const access = d.canWrite ? "read and make changes" : "read only";
  const can = d.canWrite
    ? "It can read your ads and make changes. Anything that spends money or publishes still waits for your approval."
    : "It can read your ads and reports. It cannot change anything.";
  const apps = `${SITE}/api-keys`;
  return compose({
    subject: `${d.appName} was connected to your account`,
    preheader: `${d.appName} now has ${access} access. Not you? Disconnect it.`,
    heading: "A new app was connected",
    html:
      para(
        `${bold(d.appName)} was connected to your Viral4All Ads account with ${bold(access)} access.`,
      ) +
      para(escapeHtml(can)) +
      para(`Not you? ${link(apps, "Disconnect it")} right away.`),
    text: [
      `${d.appName} was connected to your Viral4All Ads account with ${access} access.`,
      can,
      `Not you? Disconnect it: ${apps}`,
    ],
    button: { label: "Review connected apps", url: apps },
  });
}

/** The Meta connection stopped working (token expired or permission removed). */
export function metaNeedsReconnect(d: { reason: string }): Email {
  const lost =
    "Viral4All Ads lost access to your Meta account, so we cannot sync your ads or make changes for you.";
  const calm = "Nothing changed on Meta: your ads keep running as they were.";
  return compose({
    subject: "Your Meta connection stopped working",
    preheader: "Reconnect Meta so Viral4All Ads can keep managing your ads.",
    heading: "Reconnect your Meta account",
    html: para(lost) + box(`${small("Reason")}<br>${escapeHtml(d.reason)}`) + para(calm),
    text: [lost, `Reason: ${d.reason}`, calm],
    button: { label: "Reconnect Meta", url: `${SITE}/connections` },
  });
}

/** What the daily account check found, critical first. At most one per ad account per day. */
export function accountAlerts(d: {
  accountName: string;
  findings: Finding[];
  pauseRequested?: boolean;
}): Email {
  const [first] = d.findings;
  const more = d.findings.length > 1 ? ` and ${d.findings.length - 1} more` : "";
  const title = (f: Finding) => (f.severity === "critical" ? `Urgent: ${f.title}` : f.title);
  const pause =
    "Your monthly budget is used up, so we prepared a request to pause your active campaigns. Nothing changes until you approve it.";
  return compose({
    subject: `${d.accountName}: ${first.title}${more}`,
    preheader: first.detail,
    heading: "Your ad account needs a look",
    html:
      para(`Today's check of ${bold(d.accountName)} found this:`) +
      `<ul style="margin:0 0 16px;padding:0 0 0 22px;${TEXT}">${d.findings
        .map((f) => `<li style="margin:0 0 12px;">${bold(title(f))}<br>${small(f.detail)}</li>`)
        .join("")}</ul>` +
      (d.pauseRequested ? box(escapeHtml(pause)) : ""),
    text: [
      `Today's check of ${d.accountName} found this:`,
      d.findings.map((f) => `- ${title(f)}: ${f.detail}`).join("\n"),
      ...(d.pauseRequested ? [pause] : []),
    ],
    button: d.pauseRequested
      ? { label: "Review the pause request", url: `${SITE}/approvals` }
      : { label: "Open your dashboard", url: `${SITE}/dashboard` },
  });
}
