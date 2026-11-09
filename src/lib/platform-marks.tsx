import type { ComponentType, SVGProps } from "react";

export type MarkId = "meta" | "google_ads" | "tiktok" | "linkedin" | "x" | "instagram" | "youtube";

export interface PlatformMark {
  /** Marquee chip id. */
  id: MarkId;
  /** Platform id used by campaigns / social_accounts rows. */
  platform: string;
  label: string;
  /** What connecting actually does. */
  connects: string;
  /** Data pulled on sync. */
  syncs: string;
  /** "live" works today; "soon" is planned (people can ask to be told when it ships). */
  status: "live" | "soon";
  /** One line for the source pages. */
  summary: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const MetaMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M6.9 4.5c2.2 0 3.9 1.6 5.1 3.6 1.2-2 2.9-3.6 5.1-3.6C20 4.5 22 7.2 22 11.4c0 4-1.7 6.4-4.3 6.4-2 0-3.4-1.3-5-4l-.7-1.2-.7 1.2c-1.6 2.7-3 4-5 4C3.7 17.8 2 15.4 2 11.4 2 7.2 4 4.5 6.9 4.5Zm0 2.3c-1.5 0-2.6 1.8-2.6 4.6 0 2.6.9 4.1 2.4 4.1 1.1 0 2-.9 3.3-3.1l.5-.9-.5-.9C8.8 7.9 8 6.8 6.9 6.8Zm10.2 0c-1.1 0-1.9 1.1-3.2 3.2l-.5.9.5.9c1.3 2.2 2.2 3.1 3.3 3.1 1.5 0 2.4-1.5 2.4-4.1 0-2.8-1.1-4.6-2.5-4.6Z" />
  </svg>
);

const GoogleMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12.2 10.4v3.3h5.5c-.2 1.4-1.7 4.2-5.5 4.2A6 6 0 0 1 12.2 6c1.7 0 2.9.7 3.6 1.4l2.4-2.3A9 9 0 0 0 12.2 2.6a9.4 9.4 0 1 0 0 18.8c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6h-8.8Z" />
  </svg>
);

const TikTokMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M16.6 2h-3v13.1a2.6 2.6 0 1 1-2.2-2.6V9.4A5.7 5.7 0 1 0 16.7 15V8.6a6.8 6.8 0 0 0 4.1 1.3V6.8a3.9 3.9 0 0 1-4.2-4.1V2Z" />
  </svg>
);

const LinkedInMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M4.9 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.2 9h3.4v11.5H3.2V9Zm6 0h3.3v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.4 4.4 5.6v6.2h-3.4v-5.5c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.6H9.2V9Z" />
  </svg>
);

const XMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.3-8.3L2.4 3h6.4l4.4 5.9L17.5 3Zm-1.1 16.1h1.7L7.6 4.8H5.8l10.6 14.3Z" />
  </svg>
);

const InstagramMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4 1 .5.4.8.8 1 1.4.1.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-1 1.4-.4.5-.8.8-1.4 1-.4.1-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-1-.5-.4-.8-.8-1-1.4-.1-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 1-1.4.4-.5.8-.8 1.4-1 .4-.1 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 2c-3.1 0-3.5 0-4.7.1-1.1 0-1.7.2-2.1.4-.5.2-.9.4-1.2.8-.4.3-.6.7-.8 1.2-.2.4-.4 1-.4 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c0 1.1.2 1.7.4 2.1.2.5.4.9.8 1.2.3.4.7.6 1.2.8.4.2 1 .4 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1 0 1.7-.2 2.1-.4.5-.2.9-.4 1.2-.8.4-.3.6-.7.8-1.2.2-.4.4-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-1.1-.2-1.7-.4-2.1a3.3 3.3 0 0 0-.8-1.2c-.3-.4-.7-.6-1.2-.8-.4-.2-1-.4-2.1-.4-1.2-.1-1.6-.1-4.7-.1Zm0 3.4a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8Zm0 2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm5.6-3.6a1.3 1.3 0 1 1 0 2.5 1.3 1.3 0 0 1 0-2.5Z" />
  </svg>
);

const YouTubeMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12c0 1.7.1 3.3.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.3-1.5.4-3.1.4-4.8s-.1-3.3-.4-4.8ZM10 15.1V8.9l5.2 3.1L10 15.1Z" />
  </svg>
);

const ALL_MARKS: PlatformMark[] = [
  {
    id: "meta",
    platform: "meta",
    label: "Meta Ads",
    connects: "OAuth into your Meta Business account",
    syncs: "Campaigns, ad sets, spend, impressions, clicks, conversions",
    status: "live",
    summary:
      "Facebook and Instagram campaigns: read results, pause, rebudget and launch with approvals.",
    icon: MetaMark,
  },
  {
    id: "google_ads",
    platform: "google_ads",
    label: "Google Ads",
    connects: "OAuth into your Google Ads manager",
    syncs: "Search & PMax campaigns, cost, clicks, conversions, CPA",
    status: "soon",
    summary: "Search and Performance Max campaigns, with the same approvals and limits.",
    icon: GoogleMark,
  },
  {
    id: "tiktok",
    platform: "tiktok",
    label: "TikTok Ads",
    connects: "OAuth into TikTok Ads Manager",
    syncs: "Spark Ads, spend, video views, clicks, conversions",
    status: "soon",
    summary: "TikTok campaigns and Spark Ads, read and managed from your AI.",
    icon: TikTokMark,
  },
  {
    id: "linkedin",
    platform: "linkedin",
    label: "LinkedIn Ads",
    connects: "OAuth into your LinkedIn page & ad account",
    syncs: "Sponsored content, spend, impressions, leads",
    status: "soon",
    summary: "Sponsored content and lead-gen campaigns for B2B teams.",
    icon: LinkedInMark,
  },
  {
    id: "x",
    platform: "x",
    label: "X Ads",
    connects: "OAuth into your X account",
    syncs: "Posts, promoted spend, impressions, engagements",
    status: "soon",
    summary: "Promoted posts and their results.",
    icon: XMark,
  },
  {
    id: "instagram",
    platform: "meta",
    label: "Instagram",
    connects: "Included with your Meta connection",
    syncs: "Instagram placements in your Meta campaigns: spend, reach, results",
    status: "live",
    summary: "Instagram ads run through your Meta ad account, so they work today.",
    icon: InstagramMark,
  },
  {
    id: "youtube",
    platform: "google_ads",
    label: "YouTube",
    connects: "Included with your Google Ads connection",
    syncs: "Video campaigns, views, view rate, cost per view",
    status: "soon",
    summary: "YouTube video campaigns, arriving with Google Ads.",
    icon: YouTubeMark,
  },
];

/**
 * Meta is the only platform for now. Set this to true to show the planned ones again: the landing
 * page, menus, /sources pages, the Connections list and the "notify me" requests all follow it.
 */
export const SHOW_UPCOMING = false;

export const PLATFORM_MARKS: PlatformMark[] = SHOW_UPCOMING
  ? ALL_MARKS
  : ALL_MARKS.filter((m) => m.status === "live");

export const markById = (id: string) => PLATFORM_MARKS.find((m) => m.id === id);

/** Only planned sources take "notify me" requests; anything else is rejected. */
export const isRequestableSource = (id: string) => markById(id)?.status === "soon";

export const markForPlatform = (platform: string) =>
  PLATFORM_MARKS.find((m) => m.platform === platform);
