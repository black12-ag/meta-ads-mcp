import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAdCreative } from "@/lib/meta.functions";
import {
  hasBlocker,
  readCreativeMeta,
  validateCreative,
  type CheckItem,
  type CreativeMeta,
} from "@/lib/creative-validation";

const MAX_BYTES = 60 * 1024 * 1024;

export interface CreativeResult {
  previewUrl: string;
  kind: "image" | "video";
  metaImageUrl: string | null;
  metaVideoId: string | null;
  metaThumbnailHash: string | null;
  metaThumbnailUrl: string | null;
  videoStatus: "ready" | "processing" | "error" | null;
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function CheckRow({ item }: { item: CheckItem }) {
  const Icon =
    item.level === "pass" ? CheckCircle2 : item.level === "warn" ? AlertTriangle : XCircle;
  const tone =
    item.level === "pass"
      ? "text-primary"
      : item.level === "warn"
        ? "text-amber-400"
        : "text-destructive";
  return (
    <li className="flex items-start gap-2 py-1">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
      <span className="min-w-0 text-[11px]">
        <span className="font-medium text-foreground">{item.label}</span>{" "}
        <span className="text-muted-foreground">— {item.detail}</span>
      </span>
    </li>
  );
}

export function CreativeUpload({
  accountId,
  value,
  onUploaded,
  onClear,
}: {
  accountId: string;
  value: CreativeResult | null;
  onUploaded: (result: CreativeResult) => void;
  onClear: () => void;
}) {
  const uploadFn = useServerFn(uploadAdCreative);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    file: File;
    url: string;
    meta: CreativeMeta;
    checks: CheckItem[];
  } | null>(null);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const inspect = async (file: File) => {
    const meta = await readCreativeMeta(file);
    if (pending) URL.revokeObjectURL(pending.url);
    setPending({ file, url: URL.createObjectURL(file), meta, checks: validateCreative(meta) });
    resetInput();
  };

  const clearPending = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
    resetInput();
  };

  const upload = async () => {
    if (!pending) return;
    const { file } = pending;
    if (file.size > MAX_BYTES) {
      toast.error("Keep the file under 60 MB.");
      return;
    }
    setBusy(true);
    try {
      const dataBase64 = await toBase64(file);
      const result = await uploadFn({
        data: {
          accountId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64,
        },
      });
      onUploaded({
        previewUrl: result.previewUrl,
        kind: result.kind,
        metaImageUrl: result.metaImageUrl,
        metaVideoId: result.metaVideoId,
        metaThumbnailHash: result.metaThumbnailHash,
        metaThumbnailUrl: result.metaThumbnailUrl,
        videoStatus: result.videoStatus,
      });
      clearPending();
      if (result.videoStatus === "error") toast.error(result.message ?? "Meta rejected the video.");
      else toast.success(result.message ?? "Creative uploaded to Meta.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const statusLine = value
    ? value.kind === "video"
      ? value.videoStatus === "ready"
        ? "Video ready on Meta"
        : value.videoStatus === "processing"
          ? "Meta is still processing this video"
          : value.videoStatus === "error"
            ? "Meta could not process this video"
            : "Stored in your library"
      : value.metaImageUrl
        ? "Registered with Meta"
        : "Stored in your library"
    : "";

  const blocked = pending ? hasBlocker(pending.checks) : false;

  return (
    <div className="mt-2 rounded-md border border-dashed border-border p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void inspect(file);
        }}
      />

      {value ? (
        <div className="flex items-center gap-3">
          {value.kind === "video" ? (
            <video src={value.previewUrl} className="size-16 rounded object-cover" muted />
          ) : (
            <img
              src={value.previewUrl}
              alt="Ad creative preview"
              className="size-16 rounded object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {value.kind === "video" ? "Video creative" : "Image creative"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{statusLine}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            type="button"
            onClick={onClear}
            aria-label="Remove creative"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : pending ? (
        <div>
          <div className="flex gap-3">
            {pending.meta.kind === "video" ? (
              <video
                src={pending.url}
                className="size-20 rounded object-cover"
                muted
                controls={false}
              />
            ) : (
              <img
                src={pending.url}
                alt="Selected creative preview"
                className="size-20 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{pending.file.name}</p>
              <ul className="mt-1">
                {pending.checks.map((c) => (
                  <CheckRow key={c.id} item={c} />
                ))}
              </ul>
            </div>
          </div>

          {blocked ? (
            <p className="mt-2 text-[11px] text-destructive">
              Fix the items above before this creative can be used in a Meta ad.
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              type="button"
              onClick={() => void upload()}
              disabled={busy || blocked}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {busy ? "Uploading to Meta…" : "Use this creative"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={clearPending}
              disabled={busy}
            >
              Choose another
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md py-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
        >
          <ImagePlus className="size-4" />
          Upload image or video from your device
        </button>
      )}
    </div>
  );
}
