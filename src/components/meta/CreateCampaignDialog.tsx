import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createMetaCampaign } from "@/lib/meta.functions";
import { CreativeUpload, type CreativeResult } from "@/components/meta/CreativeUpload";
import { Button } from "@/components/ui/button";

import {
  COUNTRIES,
  CTA_OPTIONS,
  DESTINATIONS,
  OBJECTIVES,
  money,
  type DestinationValue,
} from "@/lib/meta/constants";

const field =
  "mt-2 h-8 w-full rounded-md border border-input bg-surface px-2.5 text-sm font-normal text-foreground outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/20";
const label = "block text-[13px] font-medium text-foreground";

const STEPS = ["Goal", "Audience & budget", "The ad"] as const;

export function CreateCampaignDialog({
  accountId,
  pageId,
  currency,
  onClose,
}: {
  accountId: string;
  pageId: string;
  currency: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createMetaCampaign);
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [objective, setObjective] =
    useState<(typeof OBJECTIVES)[number]["value"]>("OUTCOME_TRAFFIC");
  const [budgetKind, setBudgetKind] = useState<"daily" | "lifetime">("daily");
  // Number boxes keep the typed text so they can be emptied; numbers are derived from it.
  const [budgetText, setBudget] = useState("20");
  const budget = Number(budgetText);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [countries, setCountries] = useState<string[]>(["US"]);
  const [ageMinText, setAgeMin] = useState("18");
  const [ageMaxText, setAgeMax] = useState("65");
  const ageMin = Number(ageMinText);
  const ageMax = Number(ageMaxText);
  const [genders, setGenders] = useState<"all" | "male" | "female">("all");
  const [destination, setDestination] = useState<DestinationValue>("website");
  const [destinationValue, setDestinationValue] = useState("");
  const [cta, setCta] = useState("LEARN_MORE");
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [upload, setUpload] = useState<CreativeResult | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          accountId,
          pageId,
          name: name.trim(),
          objective,
          budgetKind,
          budgetMinorUnits: Math.round(budget * 100),
          startTime: startTime ? new Date(startTime).toISOString() : null,
          endTime: endTime ? new Date(endTime).toISOString() : null,
          countries,
          ageMin,
          ageMax,
          genders,
          destination,
          destinationValue: destinationValue.trim(),
          callToAction: cta,
          headline: headline.trim(),
          primaryText: primaryText.trim(),
          imageUrl: imageUrl.trim() ? imageUrl.trim() : null,
          videoId: upload?.metaVideoId ?? null,
          thumbnailHash: upload?.metaThumbnailHash ?? null,
          thumbnailUrl: upload?.metaThumbnailUrl ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Campaign created. It's paused until you run it.");
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["saved-ads"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCountry = (code: string) =>
    setCountries((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));

  const next = () => {
    if (step === 0 && name.trim().length < 2) return toast.error("Give the campaign a name.");
    if (step === 1) {
      if (countries.length === 0) return toast.error("Pick at least one country.");
      if (!(budget >= 1)) return toast.error("Budget must be at least 1.");
      if (!(ageMin >= 13 && ageMax <= 65 && ageMin <= ageMax))
        return toast.error("Ages go from 13 to 65, with the first no higher than the second.");
    }
    setStep((s) => Math.min(s + 1, 2));
  };

  const submit = () => {
    if (!destinationValue.trim()) return toast.error("Add where the ad should send people.");
    if (!headline.trim() || !primaryText.trim())
      return toast.error("Add a headline and primary text.");
    if (upload?.kind === "video" && upload.videoStatus !== "ready")
      return toast.error("Meta is still processing the video. Try again in a minute.");

    create.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create a new Meta campaign"
    >
      <div className="panel max-h-[92vh] w-full max-w-xl overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">New campaign</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Starts paused, so nothing spends yet.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <ol className="mt-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors ${
                  i < step
                    ? "border-primary bg-primary text-primary-foreground"
                    : i === step
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={`truncate text-xs ${i === step ? "text-foreground" : "text-muted-foreground"}`}
              >
                {s}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-4">
          {step === 0 ? (
            <>
              <label className={label}>
                Campaign name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Summer sale, traffic"
                  className={field}
                />
              </label>
              <fieldset>
                <legend className={label}>What should this campaign do?</legend>
                <div className="mt-2 grid gap-2">
                  {OBJECTIVES.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setObjective(o.value)}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        objective === o.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-secondary"
                      }`}
                    >
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={label}>
                  Budget type
                  <select
                    value={budgetKind}
                    onChange={(e) => setBudgetKind(e.target.value as "daily" | "lifetime")}
                    className={field}
                  >
                    <option value="daily">Daily budget</option>
                    <option value="lifetime">Lifetime budget</option>
                  </select>
                </label>
                <label className={label}>
                  Amount ({currency})
                  <input
                    type="number"
                    min={1}
                    value={budgetText}
                    onChange={(e) => setBudget(e.target.value)}
                    className={field}
                  />
                </label>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                {budgetKind === "daily"
                  ? `About ${money(Math.round(budget * 100) * 30, currency)} over 30 days.`
                  : `Total of ${money(Math.round(budget * 100), currency)} for the whole run.`}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={label}>
                  Start
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={field}
                  />
                </label>
                <label className={label}>
                  End {budgetKind === "daily" ? "(optional)" : ""}
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={field}
                  />
                </label>
              </div>

              <fieldset>
                <legend className={label}>Countries</legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => toggleCountry(c.value)}
                      aria-pressed={countries.includes(c.value)}
                      className={`h-7 rounded-md border px-2.5 text-xs transition-colors ${
                        countries.includes(c.value)
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className={label}>
                  Age from
                  <input
                    type="number"
                    min={13}
                    max={65}
                    value={ageMinText}
                    onChange={(e) => setAgeMin(e.target.value)}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Age to
                  <input
                    type="number"
                    min={13}
                    max={65}
                    value={ageMaxText}
                    onChange={(e) => setAgeMax(e.target.value)}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Gender
                  <select
                    value={genders}
                    onChange={(e) => setGenders(e.target.value as "all" | "male" | "female")}
                    className={field}
                  >
                    <option value="all">Everyone</option>
                    <option value="male">Men</option>
                    <option value="female">Women</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <label className={label}>
                Where should this ad send people?
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value as DestinationValue)}
                  className={field}
                >
                  {DESTINATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {destination === "whatsapp" ? "WhatsApp number" : "Destination link"}
                <input
                  value={destinationValue}
                  onChange={(e) => setDestinationValue(e.target.value)}
                  placeholder={
                    destination === "whatsapp" ? "+1 555 010 9988" : "https://example.com/offer"
                  }
                  className={field}
                />
              </label>
              <label className={label}>
                Button
                <select value={cta} onChange={(e) => setCta(e.target.value)} className={field}>
                  {CTA_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Headline
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="30% off this week only"
                  className={field}
                />
              </label>
              <label className={label}>
                Primary text
                <textarea
                  value={primaryText}
                  onChange={(e) => setPrimaryText(e.target.value)}
                  rows={4}
                  placeholder="Tell people why they should click."
                  className={`${field} h-auto py-2`}
                />
              </label>
              <div>
                <span className={label}>Creative</span>
                <CreativeUpload
                  accountId={accountId}
                  value={upload}
                  onUploaded={(r) => {
                    setUpload(r);
                    if (r.metaImageUrl) setImageUrl(r.metaImageUrl);
                  }}
                  onClear={() => {
                    setUpload(null);
                    setImageUrl("");
                  }}
                />
              </div>
              <label className={label}>
                Or paste an image URL
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…/creative.jpg"
                  className={field}
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 2 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create on Meta
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
