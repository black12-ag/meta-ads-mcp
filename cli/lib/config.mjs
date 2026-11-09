import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError } from "./errors.mjs";

export const DEFAULT_SERVER = "https://ads.viral4all.com";

export const LOGIN_HINT =
  "Run `viral4all-ads login` to sign in with your browser, or `viral4all-ads login --key sk_meta_...` to use an API key.";

export function configPath(env = process.env) {
  const base =
    env.XDG_CONFIG_HOME ||
    (process.platform === "win32" && env.APPDATA) ||
    join(homedir(), ".config");
  return join(base, "viral4all-ads", "config.json");
}

export function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8"));
  } catch {
    return null;
  }
}

export function writeConfig(config) {
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  // A fresh 0600 file renamed over the old one: parallel runs never read half-written tokens.
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

export const removeConfig = () => rmSync(configPath(), { force: true });

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The server's origin. Plain http only on this machine, so keys never cross a network in clear. */
export function serverUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError(`Invalid server URL: ${raw}`, 2);
  }
  if (url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    return url.origin;
  }
  throw new CliError(`The server must use https: ${raw}`, 2);
}

/** Server and credentials for this run. Saved credentials only go to the server they were saved for. */
export function session(serverFlag, env = process.env) {
  const saved = readConfig();
  const server = serverUrl(serverFlag || env.VIRAL4ALL_SERVER || saved?.server || DEFAULT_SERVER);
  if (env.VIRAL4ALL_API_KEY) {
    return { server, type: "key", key: env.VIRAL4ALL_API_KEY, fromEnv: true };
  }
  return saved?.server === server ? saved : { server };
}
