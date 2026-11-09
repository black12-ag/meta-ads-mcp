/**
 * Verifies Firebase ID tokens without the Admin SDK.
 *
 * A Firebase ID token is an RS256 JWT signed by Google. Verifying it needs only public
 * information: Google's signing certificates and the project id. The Admin SDK is avoided
 * on purpose — it breaks when bundled into the server build, and it would require shipping
 * a service-account key just to check signatures.
 *
 * Checks performed (the same set the Admin SDK applies, minus revocation):
 *   header.alg = RS256 and a known key id, signature valid for that key,
 *   iss = https://securetoken.google.com/<projectId>, aud = <projectId>,
 *   exp in the future, iat/auth_time not in the future, sub non-empty.
 */
import { createVerify, createPublicKey, X509Certificate, type KeyObject } from "node:crypto";

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

/** Small clock tolerance so a token minted a second ago is not rejected. */
const CLOCK_SKEW_SECONDS = 60;

export interface VerifiedToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export type PublicKeyResolver = (kid: string) => Promise<KeyObject | null>;

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

let certCache: { keys: Map<string, KeyObject>; expiresAt: number } | undefined;

/** Google's public signing certificates, cached for as long as the response allows. */
export async function googleKeyResolver(fetchImpl: typeof fetch = fetch): Promise<PublicKeyResolver> {
  if (!certCache || certCache.expiresAt <= Date.now()) {
    const res = await fetchImpl(CERT_URL);
    if (!res.ok) throw new Error(`Could not fetch Google signing certificates (HTTP ${res.status})`);
    const certs = (await res.json()) as Record<string, string>;
    const keys = new Map<string, KeyObject>();
    for (const [kid, pem] of Object.entries(certs)) {
      try {
        keys.set(kid, new X509Certificate(pem).publicKey);
      } catch {
        // A certificate we cannot parse is simply unusable; others still work.
      }
    }
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
    certCache = { keys, expiresAt: Date.now() + Math.max(maxAge, 60) * 1000 };
  }
  const { keys } = certCache;
  return async (kid: string) => keys.get(kid) ?? null;
}

/** Verify a token against a caller-supplied key resolver. Exported for tests. */
export async function verifyIdTokenWith(
  token: string,
  projectId: string,
  resolve: PublicKeyResolver,
  nowMs: number = Date.now(),
): Promise<VerifiedToken> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
  };
  try {
    header = decodeSegment(headerPart) as typeof header;
    payload = decodeSegment(payloadPart) as typeof payload;
  } catch {
    throw new Error("Malformed token");
  }

  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");
  if (!header.kid) throw new Error("Token has no key id");

  const key = await resolve(header.kid);
  if (!key) throw new Error("Token signed by an unknown key");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();
  if (!verifier.verify(key, Buffer.from(signaturePart, "base64url"))) {
    throw new Error("Token signature is invalid");
  }

  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Token issued for another Firebase project");
  }
  if (payload.aud !== projectId) throw new Error("Token audience does not match this project");
  if (!payload.sub) throw new Error("Token has no subject");

  const now = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("Token has expired");
  }
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error("Token was issued in the future");
  }
  if (typeof payload.auth_time === "number" && payload.auth_time - CLOCK_SKEW_SECONDS > now) {
    throw new Error("Token authentication time is in the future");
  }

  return {
    uid: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true,
  };
}

/** Production entry point: verifies against Google's live certificates. */
export async function verifyIdToken(token: string): Promise<VerifiedToken> {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");
  return verifyIdTokenWith(token, projectId, await googleKeyResolver());
}

/** Exported so tests can build a resolver from a KeyObject without touching the network. */
export function staticKeyResolver(kid: string, key: KeyObject): PublicKeyResolver {
  return async (requested) => (requested === kid ? key : null);
}

export { createPublicKey };
