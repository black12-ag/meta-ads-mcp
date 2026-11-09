/**
 * Client-safe validation rules for Meta ad creatives. Used by the upload
 * preview so problems are caught before an ad is created or updated.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export const LIMITS = {
  maxBytes: 60 * 1024 * 1024,
  image: { minWidth: 600, minHeight: 600, minRatio: 0.5, maxRatio: 1.91 },
  video: { minWidth: 120, minSeconds: 1, maxSeconds: 60 * 60, minRatio: 0.5, maxRatio: 1.91 },
} as const;

export type CheckLevel = "pass" | "warn" | "fail";

export interface CheckItem {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
}

export interface CreativeMeta {
  kind: "image" | "video";
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function ratioLabel(width: number, height: number) {
  const r = width / height;
  const known: Array<[string, number]> = [
    ["1:1", 1],
    ["4:5", 0.8],
    ["9:16", 0.5625],
    ["1.91:1", 1.91],
    ["16:9", 1.7778],
  ];
  const match = known.find(([, v]) => Math.abs(v - r) < 0.03);
  return match ? match[0] : r.toFixed(2).replace(/\.?0+$/, "") + ":1";
}

/** Read dimensions / duration from a file in the browser. */
export async function readCreativeMeta(file: File): Promise<CreativeMeta> {
  const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  const url = URL.createObjectURL(file);
  const base: CreativeMeta = {
    kind,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    width: null,
    height: null,
    durationSeconds: null,
  };

  try {
    if (kind === "image") {
      const size = await new Promise<{ w: number; h: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
      return size ? { ...base, width: size.w, height: size.h } : base;
    }
    const info = await new Promise<{ w: number; h: number; d: number } | null>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        resolve({ w: video.videoWidth, h: video.videoHeight, d: video.duration });
      video.onerror = () => resolve(null);
      video.src = url;
    });
    return info ? { ...base, width: info.w, height: info.h, durationSeconds: info.d } : base;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Turn creative metadata into a readable pass / warn / fail checklist. */
export function validateCreative(meta: CreativeMeta): CheckItem[] {
  const checks: CheckItem[] = [];
  const allowed = meta.kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;

  checks.push({
    id: "format",
    label: "Format",
    level: allowed.includes(meta.contentType) ? "pass" : "fail",
    detail: allowed.includes(meta.contentType)
      ? meta.contentType.split("/")[1].toUpperCase()
      : `${meta.contentType || "unknown"} — Meta accepts ${allowed
          .map((t) => t.split("/")[1].toUpperCase())
          .join(", ")}`,
  });

  checks.push({
    id: "size",
    label: "File size",
    level: meta.sizeBytes > LIMITS.maxBytes ? "fail" : "pass",
    detail:
      meta.sizeBytes > LIMITS.maxBytes
        ? `${formatBytes(meta.sizeBytes)} — keep it under ${formatBytes(LIMITS.maxBytes)}`
        : formatBytes(meta.sizeBytes),
  });

  if (meta.width && meta.height) {
    const minW = meta.kind === "video" ? LIMITS.video.minWidth : LIMITS.image.minWidth;
    const minH = meta.kind === "video" ? LIMITS.video.minWidth : LIMITS.image.minHeight;
    const tooSmall = meta.width < minW || meta.height < minH;
    checks.push({
      id: "dimensions",
      label: "Dimensions",
      level: tooSmall ? (meta.kind === "video" ? "fail" : "warn") : "pass",
      detail: tooSmall
        ? `${meta.width}×${meta.height} — below the recommended ${minW}×${minH}`
        : `${meta.width}×${meta.height}`,
    });

    const ratio = meta.width / meta.height;
    const { minRatio, maxRatio } = meta.kind === "video" ? LIMITS.video : LIMITS.image;
    const off = ratio < minRatio || ratio > maxRatio;
    checks.push({
      id: "ratio",
      label: "Aspect ratio",
      level: off ? "warn" : "pass",
      detail: off
        ? `${ratioLabel(meta.width, meta.height)} — feed placements prefer 4:5 to 1.91:1`
        : ratioLabel(meta.width, meta.height),
    });
  } else {
    checks.push({
      id: "dimensions",
      label: "Dimensions",
      level: "warn",
      detail: "Could not read dimensions from this file",
    });
  }

  if (meta.kind === "video") {
    const d = meta.durationSeconds;
    if (d == null) {
      checks.push({ id: "duration", label: "Duration", level: "warn", detail: "Unknown" });
    } else {
      const bad = d < LIMITS.video.minSeconds || d > LIMITS.video.maxSeconds;
      checks.push({
        id: "duration",
        label: "Duration",
        level: bad ? "fail" : d > 60 ? "warn" : "pass",
        detail: bad
          ? `${formatDuration(d)} — must be between 1s and 60m`
          : d > 60
            ? `${formatDuration(d)} — shorter videos usually perform better`
            : formatDuration(d),
      });
    }
  }

  return checks;
}

export const hasBlocker = (checks: CheckItem[]) => checks.some((c) => c.level === "fail");
