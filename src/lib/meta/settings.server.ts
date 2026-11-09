/**
 * Per-user Meta integration configuration: public base URL, callback/webhook
 * paths and the verify token, plus a live "validate configuration" check.
 * Server-only.
 */
import { getAppSettings, saveValidation, upsertAppSettings } from "@/lib/db/settings.server";
import { missingServerSecrets } from "@/lib/env-assert.server";

export type MetaSettings = {
  publicBaseUrl: string;
  redirectPath: string;
  webhookPath: string;
  deauthorizePath: string;
  dataDeletionPath: string;
  verifyToken: string;
  lastValidatedAt: string | null;
};

const DEFAULTS: MetaSettings = {
  publicBaseUrl: "",
  redirectPath: "/api/public/meta/callback",
  webhookPath: "/api/public/meta/webhook",
  deauthorizePath: "/api/public/meta/deauthorize",
  dataDeletionPath: "/api/public/meta/data-deletion",
  verifyToken: "",
  lastValidatedAt: null,
};

function normalizeBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function normalizePath(path: string, fallback: string) {
  const value = path.trim();
  if (!value) return fallback;
  return value.startsWith("/") ? value : `/${value}`;
}

export function joinUrl(base: string, path: string) {
  if (!base) return path;
  return `${normalizeBase(base)}${normalizePath(path, path)}`;
}

/** Never send the raw token to the browser — only a masked hint. */
export function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 4)}${"•".repeat(Math.max(4, token.length - 8))}${token.slice(-4)}`;
}

export async function getMetaSettings(userId: string) {
  const data = await getAppSettings(userId);

  const envBase = (process.env["PUBLIC_BASE_URL"] ?? "").trim();
  const settings: MetaSettings = data
    ? {
        publicBaseUrl: data.public_base_url || envBase,
        redirectPath: data.redirect_path,
        webhookPath: data.webhook_path,
        deauthorizePath: data.deauthorize_path,
        dataDeletionPath: data.data_deletion_path,
        verifyToken: data.verify_token ?? "",
        lastValidatedAt: data.last_validated_at,
      }
    : { ...DEFAULTS, publicBaseUrl: envBase };

  return {
    settings: { ...settings, verifyToken: maskToken(settings.verifyToken) },
    hasVerifyToken: Boolean(settings.verifyToken),
    envBaseUrl: envBase,
    urls: {
      redirect: joinUrl(settings.publicBaseUrl, settings.redirectPath),
      webhook: joinUrl(settings.publicBaseUrl, settings.webhookPath),
      deauthorize: joinUrl(settings.publicBaseUrl, settings.deauthorizePath),
      dataDeletion: joinUrl(settings.publicBaseUrl, settings.dataDeletionPath),
    },
    lastValidation: (data?.last_validation ?? null) as ValidationReport | null,
  };
}

export type SaveInput = {
  publicBaseUrl: string;
  redirectPath: string;
  webhookPath: string;
  deauthorizePath: string;
  dataDeletionPath: string;
  /** Empty string keeps the stored token untouched. */
  verifyToken?: string;
};

export async function saveMetaSettings(userId: string, input: SaveInput) {
  const existing = await getAppSettings(userId);
  const verifyToken = input.verifyToken?.trim()
    ? input.verifyToken.trim()
    : (existing?.verify_token ?? "");

  await upsertAppSettings(userId, {
    public_base_url: normalizeBase(input.publicBaseUrl),
    redirect_path: normalizePath(input.redirectPath, DEFAULTS.redirectPath),
    webhook_path: normalizePath(input.webhookPath, DEFAULTS.webhookPath),
    deauthorize_path: normalizePath(input.deauthorizePath, DEFAULTS.deauthorizePath),
    data_deletion_path: normalizePath(input.dataDeletionPath, DEFAULTS.dataDeletionPath),
    verify_token: verifyToken,
  });

  return getMetaSettings(userId);
}

export type CheckResult = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type ValidationReport = {
  ranAt: string;
  ok: boolean;
  checks: CheckResult[];
};

/** Only probe URLs on the app's own public origin: this runs server-side with user input. */
function isOwnOrigin(url: string) {
  const own = (process.env["PUBLIC_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  try {
    return Boolean(own) && new URL(url).origin === new URL(own).origin;
  } catch {
    return false;
  }
}

async function probe(url: string, init?: RequestInit) {
  if (!isOwnOrigin(url)) {
    return { status: 0, body: "refused: only this app's own PUBLIC_BASE_URL can be probed" };
  }
  try {
    const res = await fetch(url, { redirect: "follow", ...init });
    return { status: res.status, body: (await res.text()).slice(0, 200) };
  } catch (err) {
    return { status: 0, body: err instanceof Error ? err.message : "request failed" };
  }
}

/** Run every configuration check end to end and persist the report. */
export async function validateMetaSettings(userId: string): Promise<ValidationReport> {
  const data = await getAppSettings(userId);

  const envBase = (process.env["PUBLIC_BASE_URL"] ?? "").trim();
  const base = normalizeBase(data?.public_base_url || envBase);
  const token = data?.verify_token ?? "";
  const envToken = process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "";
  const checks: CheckResult[] = [];

  // 1. Secrets
  const missing = missingServerSecrets();
  checks.push({
    id: "secrets",
    label: "Server secrets configured",
    ok: missing.length === 0,
    detail: missing.length
      ? `Missing: ${missing.join(", ")}`
      : "App ID, app secret, verify token and cron secret are all set.",
  });

  // 2. Base URL shape
  let baseOk = false;
  try {
    const parsed = new URL(base);
    baseOk = parsed.protocol === "https:";
    checks.push({
      id: "base",
      label: "Public base URL",
      ok: baseOk,
      detail: baseOk ? `${base} is a valid HTTPS origin.` : "Meta requires an HTTPS URL.",
    });
  } catch {
    checks.push({
      id: "base",
      label: "Public base URL",
      ok: false,
      detail: base ? `${base} is not a valid URL.` : "No public base URL saved yet.",
    });
  }

  if (!baseOk) {
    const report: ValidationReport = { ranAt: new Date().toISOString(), ok: false, checks };
    await saveValidation(userId, report.ranAt, report);
    return report;
  }

  const url = (p: string | undefined, fallback: string) => joinUrl(base, p || fallback);

  // 3. Verify token matches the server secret used by the webhook route
  checks.push({
    id: "verify-token",
    label: "Verify token matches server secret",
    ok: Boolean(token) && token === envToken,
    detail: !token
      ? "No verify token saved. Paste the same value you entered in the Meta app dashboard."
      : token === envToken
        ? "The saved token matches META_WEBHOOK_VERIFY_TOKEN, so Meta's handshake will pass."
        : "The saved token is different from META_WEBHOOK_VERIFY_TOKEN — Meta's handshake will be rejected.",
  });

  // 4. Webhook handshake, using the exact URL Meta will call
  const challenge = `ethio-${Math.random().toString(36).slice(2, 10)}`;
  const webhookUrl = url(data?.webhook_path, DEFAULTS.webhookPath);
  const handshake = await probe(
    `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`,
  );
  const handshakeOk = handshake.status === 200 && handshake.body.trim() === challenge;
  checks.push({
    id: "webhook",
    label: "Webhook verification handshake",
    ok: handshakeOk,
    detail: handshakeOk
      ? `${webhookUrl} echoed the challenge correctly.`
      : `${webhookUrl} returned ${handshake.status || "no response"}: ${handshake.body || "empty body"}`,
  });

  // 5. OAuth redirect endpoint reachable
  const redirectUrl = url(data?.redirect_path, DEFAULTS.redirectPath);
  const redirectProbe = await probe(redirectUrl);
  const redirectOk = redirectProbe.status > 0 && redirectProbe.status < 500;
  checks.push({
    id: "redirect",
    label: "OAuth redirect URI reachable",
    ok: redirectOk,
    detail: redirectOk
      ? `${redirectUrl} responded (${redirectProbe.status}). Add this exact URL to Valid OAuth Redirect URIs.`
      : `${redirectUrl} is unreachable: ${redirectProbe.body}`,
  });

  // 6 & 7. Compliance callbacks
  for (const [id, label, path, fallback] of [
    ["deauthorize", "Deauthorize callback reachable", data?.deauthorize_path, DEFAULTS.deauthorizePath],
    ["data-deletion", "Data deletion callback reachable", data?.data_deletion_path, DEFAULTS.dataDeletionPath],
  ] as const) {
    const target = url(path, fallback);
    const res = await probe(target, { method: "POST", body: "signed_request=probe" });
    const ok = res.status > 0 && res.status < 500;
    checks.push({
      id,
      label,
      ok,
      detail: ok ? `${target} responded (${res.status}).` : `${target} is unreachable: ${res.body}`,
    });
  }

  const report: ValidationReport = {
    ranAt: new Date().toISOString(),
    ok: checks.every((c) => c.ok),
    checks,
  };
  await saveValidation(userId, report.ranAt, report);
  return report;
}
