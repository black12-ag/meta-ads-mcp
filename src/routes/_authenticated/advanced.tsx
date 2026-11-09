import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, Save, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchMetaSettings,
  saveMetaSettingsFn,
  validateMetaSettingsFn,
} from "@/lib/meta-settings.functions";

export const Route = createFileRoute("/_authenticated/advanced")({
  head: () => ({
    meta: [
      { title: "Meta integration settings — Viral4All Ads" },
      {
        name: "description",
        content:
          "Configure and save your Meta OAuth redirect URI, webhook URL, deauthorize and data deletion callbacks and verify token, then validate the whole setup in one click.",
      },
      { property: "og:title", content: "Meta integration settings — Viral4All Ads" },
      {
        property: "og:description",
        content:
          "One place to store the exact URLs and verify token your Meta app needs — with a live configuration check.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type FormState = {
  publicBaseUrl: string;
  redirectPath: string;
  webhookPath: string;
  deauthorizePath: string;
  dataDeletionPath: string;
  verifyToken: string;
};

const EMPTY: FormState = {
  publicBaseUrl: "",
  redirectPath: "/api/public/meta/callback",
  webhookPath: "/api/public/meta/webhook",
  deauthorizePath: "/api/public/meta/deauthorize",
  dataDeletionPath: "/api/public/meta/data-deletion",
  verifyToken: "",
};

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm"
      />
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="truncate font-mono text-sm text-foreground">{url || "—"}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Copy ${label}`}
        disabled={!url}
        onClick={() => {
          void navigator.clipboard.writeText(url);
          toast.success("Copied");
        }}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(fetchMetaSettings);
  const save = useServerFn(saveMetaSettingsFn);
  const validate = useServerFn(validateMetaSettingsFn);

  const { data, isLoading } = useQuery({
    queryKey: ["meta-settings"],
    queryFn: () => load(),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [tokenTouched, setTokenTouched] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      publicBaseUrl: data.settings.publicBaseUrl,
      redirectPath: data.settings.redirectPath,
      webhookPath: data.settings.webhookPath,
      deauthorizePath: data.settings.deauthorizePath,
      dataDeletionPath: data.settings.dataDeletionPath,
      verifyToken: "",
    });
    setTokenTouched(false);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          publicBaseUrl: form.publicBaseUrl,
          redirectPath: form.redirectPath,
          webhookPath: form.webhookPath,
          deauthorizePath: form.deauthorizePath,
          dataDeletionPath: form.dataDeletionPath,
          verifyToken: tokenTouched ? form.verifyToken : "",
        },
      }),
    onSuccess: () => {
      toast.success("Configuration saved");
      void queryClient.invalidateQueries({ queryKey: ["meta-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validateMutation = useMutation({
    mutationFn: () => validate(),
    onSuccess: (report) => {
      if (report.ok) toast.success("Configuration is valid");
      else toast.error("Some checks failed. See the results below.");
      void queryClient.invalidateQueries({ queryKey: ["meta-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const base = form.publicBaseUrl.trim().replace(/\/+$/, "");
  const url = (p: string) => (base ? `${base}${p.startsWith("/") ? p : `/${p}`}` : "");
  const report = validateMutation.data ?? data?.lastValidation ?? null;

  return (
    <AppShell
      title="Advanced"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending || isLoading}
          >
            {validateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Validate configuration
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-4 panel p-5">
          <header>
            <h2 className="text-base font-semibold text-foreground">Endpoints</h2>
            <p className="text-sm text-muted-foreground">
              The base URL is the public origin Meta can reach. Paths rarely need changing.
            </p>
          </header>

          <Field
            label="Public base URL"
            hint={
              data?.envBaseUrl
                ? `Server default: ${data.envBaseUrl}`
                : "Must be HTTPS, e.g. https://meta-ads-api.example.com"
            }
            placeholder="https://meta-ads-api.example.com"
            value={form.publicBaseUrl}
            onChange={(v) => setForm((f) => ({ ...f, publicBaseUrl: v }))}
          />
          <Field
            label="OAuth redirect path"
            hint="Goes into Meta → Facebook Login → Valid OAuth Redirect URIs."
            value={form.redirectPath}
            onChange={(v) => setForm((f) => ({ ...f, redirectPath: v }))}
          />
          <Field
            label="Webhook path"
            hint="Goes into Meta → Webhooks → Callback URL."
            value={form.webhookPath}
            onChange={(v) => setForm((f) => ({ ...f, webhookPath: v }))}
          />
          <Field
            label="Deauthorize callback path"
            hint="Called when a user removes your app."
            value={form.deauthorizePath}
            onChange={(v) => setForm((f) => ({ ...f, deauthorizePath: v }))}
          />
          <Field
            label="Data deletion path"
            hint="Required by Meta for data deletion requests."
            value={form.dataDeletionPath}
            onChange={(v) => setForm((f) => ({ ...f, dataDeletionPath: v }))}
          />
          <Field
            label="Webhook verify token"
            type="password"
            hint={
              data?.hasVerifyToken
                ? `Saved (${data.settings.verifyToken}). Leave blank to keep it.`
                : "Paste the same token you enter in the Meta webhook setup."
            }
            value={form.verifyToken}
            onChange={(v) => {
              setTokenTouched(true);
              setForm((f) => ({ ...f, verifyToken: v }));
            }}
          />
        </section>

        <div className="space-y-6">
          <section className="space-y-3 panel p-5">
            <header>
              <h2 className="text-base font-semibold text-foreground">Paste these into Meta</h2>
              <p className="text-sm text-muted-foreground">
                Copy each URL into your Meta app dashboard.
              </p>
            </header>
            <UrlRow label="OAuth redirect URI" url={url(form.redirectPath)} />
            <UrlRow label="Webhook callback URL" url={url(form.webhookPath)} />
            <UrlRow label="Deauthorize callback URL" url={url(form.deauthorizePath)} />
            <UrlRow label="Data deletion URL" url={url(form.dataDeletionPath)} />
          </section>

          <section className="space-y-3 panel p-5">
            <header className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Validation results</h2>
                <p className="text-sm text-muted-foreground">
                  {report
                    ? `Last run ${new Date(report.ranAt).toLocaleString()}`
                    : "Run the check to test secrets, endpoints and the webhook handshake."}
                </p>
              </div>
            </header>

            {report ? (
              <ul className="space-y-2">
                {report.checks.map((check) => (
                  <li
                    key={check.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-4 py-3"
                  >
                    {check.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{check.label}</p>
                      <p className="break-words text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No validation run yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
