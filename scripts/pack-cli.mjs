#!/usr/bin/env node
// Packs cli/ into public/cli/, served as https://ads.viral4all.com/cli/viral4all-ads.tgz for npx.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "public", "cli");
mkdirSync(out, { recursive: true });
const [{ filename }] = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", out], {
    cwd: join(root, "cli"),
    encoding: "utf8",
  }),
);
const versioned = join(out, filename);
const stable = join(out, "viral4all-ads.tgz");
copyFileSync(versioned, stable);
console.log(`${versioned}\n${stable}`);
