/** Client-safe wording for AI change requests (approvals inbox and /approve/<id>). */

export const APPROVAL_TITLES: Record<string, string> = {
  resume: "Resume ads",
  budget: "Change a budget",
  creative: "Update an ad's creative",
  pause: "Pause to protect your budget",
  adset: "Edit an ad set",
  archive: "Archive",
};

const nameOf = (o: unknown) =>
  o && typeof o === "object" && "name" in o ? String((o as { name?: unknown }).name ?? "") : "";

/** One line that says exactly what will change, so it can be approved from the list. */
export function approvalHeadline(action: string, summary: Record<string, unknown>) {
  if (action === "budget") {
    const who = nameOf(summary.object) || "Ad set";
    return `${who}: ${String(summary.budget ?? "")} budget ${String(summary.from ?? "?")} → ${String(summary.to ?? "?")}`;
  }
  if (action === "resume" || action === "pause" || action === "archive") {
    const objects = Array.isArray(summary.objects) ? summary.objects : [];
    const names = objects.map(nameOf).filter(Boolean);
    const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
    const verb = { resume: "Start delivering again", pause: "Stop spending", archive: "Archive" }[
      action
    ];
    return `${verb}: ${names.slice(0, 3).join(", ") || `${objects.length} item(s)`}${more}`;
  }
  if (action === "adset") {
    const changes = Array.isArray(summary.changes) ? summary.changes : [];
    const fields = changes.map((c: { field?: unknown }) => String(c.field));
    return `${nameOf(summary.adset) || "Ad set"}: change ${fields.join(", ") || "settings"}`;
  }
  if (action === "creative") {
    // changes is [{ field, from, to }]; requests made before field-by-field summaries kept an object
    const changes = Array.isArray(summary.changes)
      ? summary.changes.map((c: { field?: unknown }) => String(c.field))
      : summary.changes && typeof summary.changes === "object"
        ? Object.keys(summary.changes)
        : [];
    return `${nameOf(summary.ad) || "Ad"}: new ${changes.join(", ") || "creative"}`;
  }
  return action;
}

/** Label from the typed requester: "app:<name>" or "key:<prefix>". App names are chosen by the app. */
export function requesterLabel(via: string | null) {
  if (via?.startsWith("key:")) return `API key ${via.slice(4)}…`;
  if (via?.startsWith("app:")) return `connected app “${via.slice(4)}”`;
  return "your AI assistant";
}

/** One-click approve only when the headline shows the whole change; otherwise open the review page. */
export function canQuickApprove(action: string, summary: Record<string, unknown>) {
  if (action === "budget") return true;
  if (action === "resume" || action === "pause")
    return Array.isArray(summary.objects) && summary.objects.length <= 3;
  return false;
}

/** Where a request stands, for the inbox and the AI's activity log. */
export function approvalStatus(r: {
  decision: string | null;
  error: string | null;
  expires_at: string;
  undone_at?: string | null;
}) {
  if (r.decision === "approved") return r.error ? "failed" : r.undone_at ? "undone" : "approved";
  if (r.decision === "rejected") return "rejected";
  return Date.parse(r.expires_at) < Date.now() ? "expired" : "waiting";
}
