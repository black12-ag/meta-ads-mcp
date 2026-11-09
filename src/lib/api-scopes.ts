/** Shared (client-safe) definition of what an API key is allowed to do. */
export const API_SCOPES = [
  {
    value: "ads:read",
    label: "Read ads",
    description: "List ads with impressions, spend, budget and status.",
  },
  {
    value: "ads:create",
    label: "Create ads",
    description: "Launch new campaigns, ad sets and ads.",
  },
  {
    value: "ads:status",
    label: "Pause / resume",
    description: "Stop and restart ads, single or in bulk.",
  },
  {
    value: "ads:creative",
    label: "Update creative",
    description: "Swap destination links, copy, images and videos.",
  },
  {
    value: "ads:budget",
    label: "Set budget",
    description: "Change daily or lifetime budgets.",
  },
  {
    value: "ads:edit",
    label: "Edit ad sets",
    description: "Change targeting, schedule and bid caps. Each change waits for your approval.",
  },
  {
    value: "media:write",
    label: "Upload media",
    description: "Import an image or video from a URL into Meta.",
  },
  {
    value: "sync:write",
    label: "Trigger sync",
    description: "Force a fresh pull of metrics from Meta.",
  },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["value"];

export const ALL_SCOPES = API_SCOPES.map((s) => s.value) as ApiScope[];

export const DEFAULT_SCOPES: ApiScope[] = ["ads:read", "ads:status", "sync:write"];

export function scopeLabel(value: string) {
  return API_SCOPES.find((s) => s.value === value)?.label ?? value;
}
