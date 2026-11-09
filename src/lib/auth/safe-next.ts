/**
 * A same-site path to return to after sign-in, or undefined. Rejects "//host", backslashes and
 * control characters, which browsers can turn into a different origin ("/\evil.com").
 */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return undefined;
  if ([...value].some((c) => c === "\\" || c.charCodeAt(0) < 0x20)) return undefined;
  return value;
}
