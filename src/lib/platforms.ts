export type PlatformId = "meta" | "x" | "linkedin" | "tiktok" | "google_ads" | "slack";

export interface Platform {
  id: PlatformId;
  name: string;
  kind: "ads" | "social" | "ops";
  blurb: string;
  /** True when a per-user OAuth connector exists on this platform today. */
  connectorAvailable: boolean;
}

export const PLATFORMS: Platform[] = [
  {
    id: "meta",
    name: "Meta Ads",
    kind: "ads",
    blurb: "Facebook & Instagram campaigns, ad sets and creatives.",
    connectorAvailable: false,
  },
  {
    id: "google_ads",
    name: "Google Ads",
    kind: "ads",
    blurb: "Search, Performance Max and YouTube spend.",
    connectorAvailable: false,
  },
  {
    id: "x",
    name: "X (Twitter)",
    kind: "social",
    blurb: "Posts, replies and promoted content.",
    connectorAvailable: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    kind: "social",
    blurb: "Company page posts and sponsored content.",
    connectorAvailable: false,
  },
  {
    id: "tiktok",
    name: "TikTok",
    kind: "social",
    blurb: "Short-form organic and Spark Ads.",
    connectorAvailable: false,
  },
  {
    id: "slack",
    name: "Slack",
    kind: "ops",
    blurb: "Push campaign alerts into your team channels.",
    connectorAvailable: true,
  },
];

export const platformName = (id: string) => PLATFORMS.find((p) => p.id === id)?.name ?? id;

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"] as const;
export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export const OBJECTIVES = ["awareness", "traffic", "engagement", "leads", "sales"] as const;

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);

export const compact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(n ?? 0);
