/** Events the owner can send to their own tools. Client-safe. */
export const WEBHOOK_EVENTS = [
  {
    value: "approval.requested",
    label: "Approval needed",
    description: "Your AI asked for a change that waits for your approval.",
  },
  {
    value: "approval.approved",
    label: "Change approved",
    description: "An AI change was approved and applied.",
  },
  {
    value: "approval.rejected",
    label: "Change rejected",
    description: "An AI change was rejected. Nothing changed.",
  },
  {
    value: "approval.failed",
    label: "Change failed",
    description: "An approved change didn't go through on Meta.",
  },
  {
    value: "change.undone",
    label: "Change undone",
    description: "A change was put back the way it was.",
  },
  {
    value: "alert.created",
    label: "Account alert",
    description: "The daily account check found something, like a spend jump.",
  },
  {
    value: "request.blocked",
    label: "Request blocked",
    description: "An AI request went over one of your limits and was stopped.",
  },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["value"];
