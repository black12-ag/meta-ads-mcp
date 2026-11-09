import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { updateMetaCreative } from "@/lib/meta.functions";
import { CreativeUpload, type CreativeResult } from "@/components/meta/CreativeUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { CTA_OPTIONS, DESTINATIONS, type DestinationValue } from "@/lib/meta/constants";
import type { MetaAd } from "@/lib/meta/ads.server";

export function AdEditorDialog({
  ad,
  accountId,
  pageId,
  onClose,
}: {
  ad: MetaAd;
  accountId: string;
  pageId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateMetaCreative);

  const initialWhatsApp = ad.linkUrl?.includes("api.whatsapp.com") ?? false;
  const [destination, setDestination] = useState<DestinationValue>(
    initialWhatsApp ? "whatsapp" : "website",
  );
  const [destinationValue, setDestinationValue] = useState(
    initialWhatsApp ? (new URL(ad.linkUrl!).searchParams.get("phone") ?? "") : (ad.linkUrl ?? ""),
  );
  const [cta, setCta] = useState(ad.callToAction ?? "LEARN_MORE");
  const [headline, setHeadline] = useState(ad.headline ?? ad.name);
  const [primaryText, setPrimaryText] = useState(ad.primaryText ?? "");
  const [upload, setUpload] = useState<CreativeResult | null>(null);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          adId: ad.id,
          accountId,
          pageId,
          name: ad.name,
          destination,
          destinationValue,
          callToAction: cta,
          headline,
          primaryText,
          imageUrl: upload ? (upload.metaImageUrl ?? null) : (ad.imageUrl ?? null),
          videoId: upload?.metaVideoId ?? null,
          thumbnailHash: upload?.metaThumbnailHash ?? null,
          thumbnailUrl: upload?.metaThumbnailUrl ?? null,
        },
      }),

    onSuccess: () => {
      toast.success("Ad updated on Meta");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dest = DESTINATIONS.find((d) => d.value === destination)!;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${ad.name}`}
    >
      <div className="panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Edit ad</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">{ad.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-[13px] font-medium text-foreground">
            Where should this ad send people?
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value as DestinationValue)}
              className="mt-2 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            >
              {DESTINATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <p className="-mt-2 text-xs text-muted-foreground">{dest.hint}</p>

          <label className="block text-[13px] font-medium text-foreground">
            {destination === "whatsapp" ? "WhatsApp number" : "Destination link"}
            <Input
              value={destinationValue}
              onChange={(e) => setDestinationValue(e.target.value)}
              placeholder={
                destination === "whatsapp" ? "+1 555 010 9988" : "https://example.com/offer"
              }
              className="mt-2 font-normal"
            />
          </label>

          <label className="block text-[13px] font-medium text-foreground">
            Button
            <select
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="mt-2 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            >
              {CTA_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[13px] font-medium text-foreground">
            Headline
            <Input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="mt-2 font-normal"
            />
          </label>

          <label className="block text-[13px] font-medium text-foreground">
            Primary text
            <Textarea
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              rows={4}
              className="mt-2 font-normal"
            />
          </label>

          <div>
            <span className="block text-[13px] font-medium text-foreground">Creative</span>
            {!upload && ad.imageUrl ? (
              <img
                src={ad.imageUrl}
                alt="Current ad creative"
                className="mt-2 h-24 w-full rounded-md border border-border object-cover"
              />
            ) : null}
            <CreativeUpload
              accountId={accountId}
              value={upload}
              onUploaded={setUpload}
              onClear={() => setUpload(null)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Upload a new image or video to swap the creative on this live ad.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!pageId) return toast.error("Choose a Facebook page on Connections first.");
              if (!destinationValue.trim()) return toast.error("Add a destination.");
              if (upload?.kind === "video" && upload.videoStatus !== "ready")
                return toast.error("Meta is still processing the video. Try again in a minute.");
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Push to Meta
          </Button>
        </div>
      </div>
    </div>
  );
}
