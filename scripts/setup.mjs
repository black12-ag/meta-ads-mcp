#!/usr/bin/env node
/**
 * One command to get Viral4All Ads running on your computer or server:
 *
 *   node scripts/setup.mjs            asks a few questions, then does everything
 *   node scripts/setup.mjs --yes      no questions: defaults for everything you can skip
 *
 * It installs the packages, makes your secret keys, creates the database, writes `.env.local`
 * (never commit it), applies the schema, and offers to start the app. Safe to run again: values
 * already in `.env.local` are kept, and only missing ones are asked for.
 * Only Node's own modules are used until `npm install` has run.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(root, ".env.local");
const yes = process.argv.includes("--yes") || !process.stdin.isTTY;

const say = (m = "") => console.log(m);
const ok = (m) => say(`  ✓ ${m}`);
const warn = (m) => say(`  ! ${m}`);

// --- 1. Node -----------------------------------------------------------------------------------
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 9)) {
  console.error(`Node 22.9 or newer is needed (you have ${process.versions.node}).`);
  process.exit(1);
}
say("Viral4All Ads setup\n");
ok(`Node ${process.versions.node}`);

// --- 2. Packages -------------------------------------------------------------------------------
// Check for real packages, not just the folder: an install that was interrupted leaves it half full.
const installed = ["pg", "vite"].every((n) =>
  existsSync(join(root, "node_modules", n, "package.json")),
);
if (!installed) {
  say("\nInstalling packages (a minute or two)...");
  const r = spawnSync("npm", ["install"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) {
    console.error("npm install failed. Fix the error above and run this again.");
    process.exit(1);
  }
}
ok("Packages installed");

// --- 3. Settings: what is already there, what we make, what we ask -------------------------------
const current = {};
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) current[m[1]] = m[2];
  }
  ok("Found .env.local: keeping the values already in it");
}

const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
async function ask(key, question, { fallback = "", hint = "" } = {}) {
  if (current[key]) return current[key];
  if (yes) return fallback;
  if (hint) say(`\n  ${hint}`);
  const answer = (await rl.question(`  ${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback;
}
const secret = () => randomBytes(24).toString("hex");

const env = { ...current };
say(
  "\nA few questions. Press Enter to skip any you don't have yet; you can fill them in later in .env.local.",
);

env.PUBLIC_BASE_URL = await ask("PUBLIC_BASE_URL", "Public address of the app", {
  fallback: "http://localhost:3000",
  hint: "Where people will open it. On your own computer, keep the default. On a server, use your https:// address.",
});
env.DATABASE_URL = await ask("DATABASE_URL", "PostgreSQL address", {
  fallback: "postgresql://localhost:5432/viral4all_ads",
  hint: "The database is created for you if it doesn't exist.",
});

say("\n  Firebase (sign-in). Firebase console → Project settings → your Web app.");
env.VITE_FIREBASE_API_KEY = await ask("VITE_FIREBASE_API_KEY", "Firebase API key");
env.VITE_FIREBASE_AUTH_DOMAIN = await ask("VITE_FIREBASE_AUTH_DOMAIN", "Firebase auth domain");
env.VITE_FIREBASE_PROJECT_ID = await ask("VITE_FIREBASE_PROJECT_ID", "Firebase project id");
env.VITE_FIREBASE_APP_ID = await ask("VITE_FIREBASE_APP_ID", "Firebase app id");
env.FIREBASE_PROJECT_ID = current.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;

say("\n  Meta app (developers.facebook.com → your app → Settings → Basic).");
env.META_APP_ID = await ask("META_APP_ID", "Meta App ID");
env.META_APP_SECRET = await ask(
  "META_APP_SECRET",
  "Meta App Secret (shown as you type; stays on this machine)",
);
rl?.close();

// Keys nobody should have to invent.
env.TOKEN_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
env.CREATIVE_URL_SECRET ||= secret();
env.META_WEBHOOK_VERIFY_TOKEN ||= secret();
env.META_SYNC_CRON_SECRET ||= secret();
env.CREATIVES_DIR ||= join(root, "data", "creatives");

// --- 4. Write .env.local -----------------------------------------------------------------------
const ORDER = [
  "PUBLIC_BASE_URL",
  "DATABASE_URL",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "FIREBASE_PROJECT_ID",
  "META_APP_ID",
  "META_APP_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "CREATIVE_URL_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_SYNC_CRON_SECRET",
  "CREATIVES_DIR",
];
const extra = Object.keys(env).filter((k) => !ORDER.includes(k));
writeFileSync(
  ENV_FILE,
  "# Written by scripts/setup.mjs. Secret: never commit this file.\n" +
    "# TOKEN_ENCRYPTION_KEY encrypts the Meta tokens in the database. If you lose it they can't be read.\n" +
    [...ORDER, ...extra].map((k) => `${k}=${env[k] ?? ""}`).join("\n") +
    "\n",
);
chmodSync(ENV_FILE, 0o600);
mkdirSync(env.CREATIVES_DIR, { recursive: true });
ok("Wrote .env.local (secret keys made for you)");

// --- 5. Database -------------------------------------------------------------------------------
const { default: pg } = await import("pg");
async function ensureDatabase(url) {
  const probe = new pg.Client({ connectionString: url });
  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (e) {
    await probe.end().catch(() => {});
    if (e.code !== "3D000") throw e; // anything but "database does not exist"
  }
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Won't create a database called "${name}".`);
  u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  ok(`Created database ${name}`);
}
try {
  await ensureDatabase(env.DATABASE_URL);
} catch (e) {
  console.error(`\nCan't reach PostgreSQL at ${env.DATABASE_URL.replace(/:[^:@/]*@/, ":***@")}`);
  console.error(`  ${e.message}`);
  console.error("Start PostgreSQL (or fix DATABASE_URL in .env.local) and run this again.");
  process.exit(1);
}
const migrate = spawnSync(process.execPath, ["db/migrate.mjs"], {
  cwd: root,
  env: { ...process.env, ...env },
  stdio: "inherit",
});
if (migrate.status !== 0) process.exit(1);
ok("Database ready");

// --- 6. What is left for you -------------------------------------------------------------------
const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
const todo = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "META_APP_ID",
  "META_APP_SECRET",
].filter((k) => !env[k]);
say("\nDone. Two things to set in Meta (developers.facebook.com → your app):");
say(`  Valid OAuth Redirect URI:  ${base}/api/public/meta/callback`);
say(`  Privacy policy URL:        ${base}/privacy`);
if (todo.length) {
  warn(`Still empty in .env.local: ${todo.join(", ")}`);
  say("  Fill them in, then run:  npm run dev");
}
say(`\nEvery 30 minutes your scheduler should call (see the README):`);
say(
  `  POST ${base}/api/public/meta/sync   with header  x-cron-secret: <META_SYNC_CRON_SECRET in .env.local>`,
);

// --- 7. Start ----------------------------------------------------------------------------------
if (!yes && !todo.length) {
  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  const go = (await rl2.question("\nStart the app now? [Y/n] ")).trim().toLowerCase();
  rl2.close();
  if (go !== "n") {
    say("\nStarting (the address is printed below; Ctrl+C to stop)...\n");
    spawn("npm", ["run", "dev"], { cwd: root, stdio: "inherit" });
  }
} else {
  say("\nStart it any time with:  npm run dev");
}
