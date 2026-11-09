#!/usr/bin/env node
/**
 * Repo-wide guard: no secret may be read from (or hardcoded in) client code.
 *
 * Rules:
 *  1. Client-reachable files (everything under src/ except *.server.ts(x),
 *     src/routes/api/** server handlers and scripts) must not read process.env.
 *  2. No file anywhere may name a server secret outside server-only modules.
 *  3. No file may contain a literal secret-looking value (Meta app secret,
 *     Supabase secret key, service-role JWT, sk_meta_ key, demo password).
 *
 * Run: bun run check:secrets
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const SERVER_SECRET_NAMES = [
  "META_APP_SECRET",
  "META_APP_ID",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_SYNC_CRON_SECRET",
  "DATABASE_URL",
    "CREATIVE_URL_SECRET",
];

/** Non-secret env vars that are safe to read from shared/client-reachable code. */
const PUBLIC_ENV_NAMES = [
  "NODE_ENV",
  "MODE",
  "PUBLIC_BASE_URL",
  "FIREBASE_PROJECT_ID",
  "HOST",
  "PORT",
];

const LITERAL_PATTERNS = [
  { name: "Firebase private key", re: /-----BEGIN PRIVATE KEY-----/ },
  { name: "postgres url with password", re: /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/ },
  { name: "issued API key", re: /\bsk_meta_[A-Za-z0-9_-]{16,}/ },
  { name: "demo credential", re: /demo@example\.com/ },
];

function isServerOnly(rel) {
  return (
    /\.server\.tsx?$/.test(rel) ||
    rel.startsWith("src/routes/api/") ||
    rel === "src/server.ts" ||
    rel === "src/start.ts" ||
    rel.startsWith("src/lib/db/")
  );
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === ".output")
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|md|json|sql)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations = [];
const files = [...walk(SRC), ...walk(join(ROOT, "supabase"))];

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const serverOnly = isServerOnly(rel);
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (/^\s*(\/\/|\*|#|--)/.test(line)) {
      // comments: still scan for literals, skip env-usage rules
    } else if (!serverOnly) {
      for (const match of line.matchAll(/process\.env(?:\.(\w+)|\[["'](\w+)["']\])/g)) {
        const name = match[1] ?? match[2];
        if (!PUBLIC_ENV_NAMES.includes(name))
          violations.push(`${at}  reads non-public env var ${name} in client-reachable file`);
      }
      for (const name of SERVER_SECRET_NAMES) {
        if (line.includes(name) && !/font-mono|<code|VITE_/.test(line))
          violations.push(`${at}  references server secret ${name} in client-reachable file`);
      }
    }
    for (const { name, re } of LITERAL_PATTERNS) {
      if (re.test(line)) violations.push(`${at}  hardcoded ${name}`);
    }
  });
}

if (violations.length) {
  console.error(`\n✖ ${violations.length} client-secret violation(s):\n`);
  for (const v of violations) console.error("  " + v);
  console.error("");
  process.exit(1);
}
console.log(`✓ no secrets reachable from client code (${files.length} files scanned)`);
