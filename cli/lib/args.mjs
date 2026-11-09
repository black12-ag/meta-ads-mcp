import { readFileSync } from "node:fs";
import { CliError } from "./errors.mjs";

const usage = (message) => new CliError(message, 2);

/** A property's JSON Schema type, ignoring "null" in unions. */
export function typeOf(schema = {}) {
  const type = schema.type ?? schema.anyOf?.find((s) => s.type !== "null")?.type;
  return Array.isArray(type) ? type.find((t) => t !== "null") : type;
}

function jsonObject(text, what) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // reported below
  }
  throw usage(`${what} must be a JSON object.`);
}

function coerce(raw, schema, flag) {
  const type = typeOf(schema);
  if (type === "integer" || type === "number") {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n) || (type === "integer" && !Number.isInteger(n))) {
      throw usage(
        `${flag} needs ${type === "integer" ? "a whole number" : "a number"}, not "${raw}".`,
      );
    }
    return n;
  }
  if (type === "boolean") {
    if (raw === "true" || raw === "false") return raw === "true";
    throw usage(`${flag} is true or false, not "${raw}".`);
  }
  return type === "object" ? jsonObject(raw, flag) : raw;
}

// --date-preset, --datePreset and --date_preset all name datePreset.
const normalize = (name) => name.replace(/[-_]/g, "").toLowerCase();

/**
 * Tool arguments from command-line words, typed by the tool's inputSchema: `--name value`,
 * `--name=value`, `--flag` / `--flag=false`, arrays by repeating or with commas, objects as JSON,
 * `--input '<json>'` or `-` (JSON on stdin) as a base, and positional words for aliases.
 */
export function parseToolArgs(
  words,
  schema = {},
  { positional = [], readStdin = () => readFileSync(0, "utf8") } = {},
) {
  const props = schema.properties ?? {};
  const names = new Map(Object.keys(props).map((key) => [normalize(key), key]));
  let base = {};
  const args = {};
  const set = (key, raw) => {
    const prop = props[key];
    if (typeOf(prop) !== "array") {
      args[key] = coerce(raw, prop, `--${key}`);
      return;
    }
    const parts = typeOf(prop.items) === "object" ? [raw] : raw.split(",").map((s) => s.trim());
    const items = parts.filter(Boolean).map((part) => coerce(part, prop.items, `--${key}`));
    args[key] = [...(args[key] ?? []), ...items];
  };

  let next = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word === "-") {
      base = jsonObject(readStdin(), "stdin");
      continue;
    }
    if (!word.startsWith("--")) {
      const key = positional[next];
      if (!key) throw usage(`Unexpected argument "${word}".`);
      set(key, word);
      if (typeOf(props[key]) !== "array") next++;
      continue;
    }
    const eq = word.indexOf("=");
    const name = eq < 0 ? word.slice(2) : word.slice(2, eq);
    let value = eq < 0 ? undefined : word.slice(eq + 1);
    if (name === "input") {
      value ??= words[++i];
      if (value === undefined) throw usage("--input needs JSON, or - to read it from stdin.");
      base = jsonObject(value === "-" ? readStdin() : value, "--input");
      continue;
    }
    const key = names.get(normalize(name));
    if (!key) throw usage(`Unknown option --${name}.`);
    if (value === undefined && typeOf(props[key]) === "boolean") value = "true";
    value ??= words[++i];
    if (value === undefined) throw usage(`--${name} needs a value.`);
    set(key, value);
  }

  const result = { ...base, ...args };
  const missing = (schema.required ?? []).filter((key) => result[key] === undefined);
  if (missing.length) throw usage(`Missing ${missing.map((key) => `--${key}`).join(", ")}.`);
  return result;
}
