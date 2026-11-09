const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Asks Cloudflare whether a Turnstile token is real. Fails closed: a missing token, a network
 * error or any answer but success counts as "not human".
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetchImpl(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean; hostname?: string };
    return data.success === true;
  } catch {
    return false;
  }
}
