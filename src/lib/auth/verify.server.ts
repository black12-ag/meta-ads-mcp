/** Turns an Authorization header into a verified user, with an injectable verifier for tests. */
import { verifyIdToken } from "./firebase-token.server";

export type Verified = { uid: string; email: string | null; emailVerified?: boolean };
export type Verifier = (token: string) => Promise<Verified>;

export async function verifyBearer(
  header: string | null,
  verify: Verifier = verifyIdToken,
): Promise<Verified> {
  if (!header || !header.startsWith("Bearer ")) throw new Error("Unauthorized: missing bearer token");
  const token = header.slice(7).trim();
  if (!token) throw new Error("Unauthorized: empty token");
  try {
    return await verify(token);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "verification failed";
    throw new Error(`Unauthorized: ${detail}`);
  }
}
