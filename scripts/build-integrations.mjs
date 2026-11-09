#!/usr/bin/env node
/**
 * Packages integrations/claude-plugin for self-hosting on ads.viral4all.com (public/ is served at
 * the site root). Overwrites on every run:
 *  - public/claude/viral4all-ads-plugin.zip: the plugin folder's contents at the zip root.
 *  - public/claude/marketplace.json: the local marketplace with an archive source and its sha256.
 *  - public/skills/<skill>.zip: <skill>/SKILL.md, for upload to claude.ai.
 *  - public/skills/index.json: [{ name, description, url }].
 *  - integrations/dist/viral4all-ads-openai.zip: integrations/openai-plugin plus the same skills, for
 *    the owner to upload at platform.openai.com/plugins. Git-ignored and not served.
 *
 * Needs the system `zip`. Run: node scripts/build-integrations.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const SITE = "https://ads.viral4all.com";
const ROOT = resolve(import.meta.dirname, "..");
const MARKET = join(ROOT, "integrations/claude-plugin");
const OPENAI = join(ROOT, "integrations/openai-plugin");
const OUT_CLAUDE = join(ROOT, "public/claude");
const OUT_SKILLS = join(ROOT, "public/skills");
const OUT_DIST = join(ROOT, "integrations/dist");
const FIXED_TIME = new Date("1980-01-01T00:00:00Z"); // the earliest time a zip entry can hold

const visible = (name) => name !== ".DS_Store";
const list = (dir) => readdirSync(dir).filter(visible).sort();

/**
 * Zips `entries` (relative to `dir`) into `outFile` and returns the zip's sha256. It zips a temp
 * copy with fixed times and modes, so unchanged sources give the same bytes and the same hash.
 * shortcut: entry order follows readdir, which is stable on one filesystem; byte-identical zips
 * across different machines would need an explicit sorted file list instead of -r.
 */
function zip(dir, entries, outFile) {
  const tmp = mkdtempSync(join(tmpdir(), "v4a-zip-"));
  try {
    for (const entry of entries) {
      cpSync(join(dir, entry), join(tmp, entry), {
        recursive: true,
        filter: (src) => visible(basename(src)),
      });
    }
    const pin = (path) => {
      const isDir = statSync(path).isDirectory();
      if (isDir) readdirSync(path).forEach((name) => pin(join(path, name)));
      chmodSync(path, isDir ? 0o755 : 0o644);
      utimesSync(path, FIXED_TIME, FIXED_TIME);
    };
    entries.forEach((entry) => pin(join(tmp, entry)));
    // zip stores local time, so pin the zone too.
    execFileSync("zip", ["-X", "-r", "-q", outFile, ...entries], {
      cwd: tmp,
      env: { ...process.env, TZ: "UTC" },
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return createHash("sha256").update(readFileSync(outFile)).digest("hex");
}

/** name and description from a SKILL.md, checked against the Agent Skills rules claude.ai enforces. */
function readSkill(skillsDir, folder) {
  const file = join(skillsDir, folder, "SKILL.md");
  const head = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
  const field = (key) => head.match(new RegExp(`^${key}: *(.*)$`, "m"))?.[1].trim() ?? "";
  const name = field("name");
  const description = field("description");
  if (name !== folder || name.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`${file}: name must be the folder name, lowercase-hyphen, at most 64 chars.`);
  }
  // One plain YAML line: no quote or block marker up front, no ": " or " #" for YAML to misread.
  if (!description || description.length > 1024 || /^["'|>]|: | #/.test(description)) {
    throw new Error(`${file}: description must be one plain line of at most 1024 chars.`);
  }
  return { name, description };
}

/**
 * The OpenAI directory's final-submission rules for the listing and review cases
 * (developers.openai.com/plugins/deploy/submission-errors), so an over-long edit fails here.
 */
function checkOpenAiListing(file) {
  const openai = JSON.parse(readFileSync(file, "utf8")).extensions?.["com.openai"] ?? {};
  const ui = openai.interface ?? {};
  const cases = openai.review?.test_cases ?? {};
  const line = (text, max) =>
    typeof text === "string" && /^[^\n]+$/.test(text.trim()) && text.length <= max;
  const prompts = ui.defaultPrompt ?? [];
  const rules = {
    "displayName: one line of up to 30 characters": line(ui.displayName, 30),
    "shortDescription: one line of up to 30 characters": line(ui.shortDescription, 30),
    "longDescription: up to 4000 characters":
      ui.longDescription?.trim() && ui.longDescription.length <= 4000,
    "defaultPrompt: up to 3 unique lines of up to 128 characters":
      prompts.length <= 3 &&
      new Set(prompts).size === prompts.length &&
      prompts.every((p) => line(p, 128)),
    "capabilities: up to 20 lines of up to 120 characters":
      (ui.capabilities ?? []).length <= 20 && (ui.capabilities ?? []).every((c) => line(c, 120)),
    "website, support, privacy and terms URLs: https": [
      ui.websiteURL,
      ui.supportURL,
      ui.privacyPolicyURL,
      ui.termsOfServiceURL,
    ].every((url) => /^https:\/\/[^\s/@]+/.test(url ?? "")),
    "logo and composerIcon: ./ paths to files in the package": [ui.logo, ui.composerIcon].every(
      (path) => path?.startsWith("./") && existsSync(join(OPENAI, path)),
    ),
    "review: exactly 5 positive and 3 negative test cases":
      cases.positive?.length === 5 && cases.negative?.length === 3,
    "positive test cases: tools_triggered and expected_behavior": cases.positive?.every(
      (c) => c.tools_triggered && c.expected_behavior,
    ),
  };
  const broken = Object.keys(rules).filter((rule) => !rules[rule]);
  if (broken.length) throw new Error(`${file}: ${broken.join("; ")}`);
}

const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

for (const dir of [OUT_CLAUDE, OUT_SKILLS, OUT_DIST]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const local = JSON.parse(readFileSync(join(MARKET, ".claude-plugin/marketplace.json"), "utf8"));
const skills = [];
const plugins = local.plugins.map((plugin) => {
  const dir = resolve(MARKET, plugin.source);
  const skillsDir = join(dir, "skills");
  for (const folder of list(skillsDir)) {
    skills.push({ ...readSkill(skillsDir, folder), url: `${SITE}/skills/${folder}.zip` });
    zip(skillsDir, [folder], join(OUT_SKILLS, `${folder}.zip`));
  }
  const file = `${plugin.name}-plugin.zip`;
  const sha256 = zip(dir, list(dir), join(OUT_CLAUDE, file));
  // The marketplace points at a copy named after its hash: a CDN may keep serving an older zip
  // under the stable name, and Claude Code refuses a zip whose sha256 doesn't match.
  const hashed = `${plugin.name}-plugin-${sha256.slice(0, 12)}.zip`;
  copyFileSync(join(OUT_CLAUDE, file), join(OUT_CLAUDE, hashed));
  console.log(`public/claude/${hashed} sha256 ${sha256}`);
  return { ...plugin, source: { source: "archive", url: `${SITE}/claude/${hashed}`, sha256 } };
});

writeJson(join(OUT_CLAUDE, "marketplace.json"), { ...local, plugins });
writeJson(join(OUT_SKILLS, "index.json"), skills);
console.log(
  `public/claude/marketplace.json, public/skills/index.json and ${skills.length} skill zips`,
);

// OpenAI wants at least one skill in a public plugin ZIP, so it ships the Claude plugin's skills.
checkOpenAiListing(join(OPENAI, "plugin.json"));
const stage = mkdtempSync(join(tmpdir(), "v4a-openai-"));
try {
  cpSync(OPENAI, stage, { recursive: true });
  cpSync(join(MARKET, "plugins/viral4all-ads/skills"), join(stage, "skills"), { recursive: true });
  const sha256 = zip(stage, list(stage), join(OUT_DIST, "viral4all-ads-openai.zip"));
  console.log(`integrations/dist/viral4all-ads-openai.zip sha256 ${sha256}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
