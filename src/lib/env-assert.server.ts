/**
 * Startup assertion for required server-only secrets.
 * Server-only module — never import from client code.
 */

export const REQUIRED_SERVER_SECRETS = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_SYNC_CRON_SECRET",
  "TOKEN_ENCRYPTION_KEY",
] as const;

export function missingServerSecrets(): string[] {
  return REQUIRED_SERVER_SECRETS.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

/** Throws when any required secret is missing. Use inside request handlers. */
export function assertServerSecrets(): void {
  const missing = missingServerSecrets();
  if (missing.length) {
    throw new Error(
      `Missing required server secret(s): ${missing.join(", ")}. Configure them in backend secrets.`,
    );
  }
}

let announced = false;

/** Loud boot-time check. Logs a banner instead of hard-crashing the whole site. */
export function reportServerSecretsAtBoot(): void {
  if (announced) return;
  announced = true;
  const missing = missingServerSecrets();
  if (!missing.length) return;
  console.error(
    [
      "",
      "==================================================================",
      " FATAL CONFIG ERROR — required server secrets are missing:",
      ...missing.map((name) => `   - ${name}`),
      " Meta OAuth, webhooks and scheduled sync WILL fail until they are set.",
      "==================================================================",
      "",
    ].join("\n"),
  );
}
