import { GRAPH, graphGet } from "./graph.server";
import { saveCreative, signCreativeUrl } from "@/lib/storage/creatives.server";

export interface UploadedCreative {
  storagePath: string;
  /** Signed url for previewing inside the app. */
  previewUrl: string;
  kind: "image" | "video";
  /** Meta CDN url for image creatives. */
  metaImageUrl: string | null;
  metaImageHash: string | null;
  /** Meta ad video id for video creatives. */
  metaVideoId: string | null;
  /** Thumbnail image hash Meta picked for the video. */
  metaThumbnailHash: string | null;
  metaThumbnailUrl: string | null;
  /** "ready" | "processing" | "error" — videos transcode asynchronously. */
  videoStatus: "ready" | "processing" | "error" | null;
  message: string | null;
}

function extensionFor(contentType: string, filename: string) {
  const fromName = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  if (fromName) return fromName.replace(/[^a-z0-9]/g, "").slice(0, 5);
  return (
    contentType
      .split("/")[1]
      ?.replace(/[^a-z0-9]/g, "")
      .slice(0, 5) || "bin"
  );
}

async function readMetaError(res: Response, fallback: string) {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.error_user_msg ?? parsed?.error?.message ?? text.slice(0, 400);
  } catch {
    return text.slice(0, 400) || fallback;
  }
}

/** Push raw bytes into Meta's ad image library and return the permanent CDN url. */
export async function uploadImageToMeta(
  token: string,
  accountId: string,
  bytes: Uint8Array,
  filename: string,
  contentType: string,
) {
  const form = new FormData();
  form.set("access_token", token);
  form.set("filename", new Blob([bytes as unknown as BlobPart], { type: contentType }), filename);
  const res = await fetch(`${GRAPH}/act_${accountId}/adimages`, { method: "POST", body: form });
  if (!res.ok)
    throw new Error(`Meta rejected the image: ${await readMetaError(res, "upload failed")}`);
  const parsed = (await res.json()) as { images?: Record<string, { hash?: string; url?: string }> };
  const first = parsed.images ? Object.values(parsed.images)[0] : undefined;
  return { hash: first?.hash ?? null, url: first?.url ?? null };
}

/** Push raw bytes into Meta's ad video library. Meta transcodes asynchronously. */
async function uploadVideoToMeta(
  token: string,
  accountId: string,
  bytes: Uint8Array,
  filename: string,
  contentType: string,
) {
  const form = new FormData();
  form.set("access_token", token);
  form.set("name", filename);
  form.set("source", new Blob([bytes as unknown as BlobPart], { type: contentType }), filename);
  const res = await fetch(`${GRAPH}/act_${accountId}/advideos`, { method: "POST", body: form });
  if (!res.ok)
    throw new Error(`Meta rejected the video: ${await readMetaError(res, "upload failed")}`);
  const parsed = (await res.json()) as { id?: string };
  if (!parsed.id) throw new Error("Meta did not return a video id.");
  return parsed.id;
}

/**
 * Poll a video until Meta finishes processing, then read back a thumbnail.
 * Returns quickly with "processing" rather than blocking a whole request.
 */
export async function checkVideoReady(token: string, videoId: string, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    const info = await graphGet<{
      status?: { video_status?: string };
      thumbnails?: { data?: Array<{ uri?: string; is_preferred?: boolean }> };
    }>(videoId, token, { fields: "status,thumbnails{uri,is_preferred}" });

    const state = info.status?.video_status ?? "processing";
    if (state === "ready") {
      const thumbs = info.thumbnails?.data ?? [];
      const preferred = thumbs.find((t) => t.is_preferred) ?? thumbs[0];
      return { status: "ready" as const, thumbnailUrl: preferred?.uri ?? null };
    }
    if (state === "error") return { status: "error" as const, thumbnailUrl: null };
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { status: "processing" as const, thumbnailUrl: null };
}

/** Register a remote thumbnail with Meta so it can be used as a video creative image. */
async function registerThumbnail(token: string, accountId: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { hash: null, url };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const uploaded = await uploadImageToMeta(
      token,
      accountId,
      bytes,
      "thumbnail.jpg",
      res.headers.get("content-type") ?? "image/jpeg",
    );
    return { hash: uploaded.hash, url: uploaded.url ?? url };
  } catch {
    return { hash: null, url };
  }
}

/**
 * Store the uploaded creative in private storage and register it with Meta so
 * it can be used directly in an ad creative (images and videos both supported).
 */
export async function storeCreative(params: {
  userId: string;
  accountId: string | null;
  token: string | null;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<UploadedCreative> {
  const kind: "image" | "video" = params.contentType.startsWith("video/") ? "video" : "image";
  const ext = extensionFor(params.contentType, params.filename);
  const { storagePath } = await saveCreative(params.userId, params.bytes, ext);

  const base: UploadedCreative = {
    storagePath,
    previewUrl: signCreativeUrl(storagePath),
    kind,
    metaImageUrl: null,
    metaImageHash: null,
    metaVideoId: null,
    metaThumbnailHash: null,
    metaThumbnailUrl: null,
    videoStatus: null,
    message: null,
  };

  if (!params.token || !params.accountId) {
    return { ...base, message: "Stored in your library. Connect Meta to use it in an ad." };
  }

  if (kind === "image") {
    const uploaded = await uploadImageToMeta(
      params.token,
      params.accountId,
      params.bytes,
      params.filename,
      params.contentType,
    );
    return { ...base, metaImageUrl: uploaded.url, metaImageHash: uploaded.hash };
  }

  const videoId = await uploadVideoToMeta(
    params.token,
    params.accountId,
    params.bytes,
    params.filename,
    params.contentType,
  );
  const ready = await checkVideoReady(params.token, videoId);
  let thumbHash: string | null = null;
  let thumbUrl: string | null = ready.thumbnailUrl;
  if (ready.status === "ready" && ready.thumbnailUrl) {
    const registered = await registerThumbnail(params.token, params.accountId, ready.thumbnailUrl);
    thumbHash = registered.hash;
    thumbUrl = registered.url;
  }

  return {
    ...base,
    metaVideoId: videoId,
    metaThumbnailHash: thumbHash,
    metaThumbnailUrl: thumbUrl,
    videoStatus: ready.status,
    message:
      ready.status === "ready"
        ? "Video ready to use in an ad."
        : ready.status === "processing"
          ? "Meta is still processing the video — it can take a minute."
          : "Meta could not process this video. Try a different file.",
  };
}
