/**
 * Meta sends deauthorize / data-deletion callbacks as a `signed_request`:
 * `<base64url signature>.<base64url json payload>` signed with the app secret.
 */
import {
  deleteConnections,
  findConnectionsByMetaUser,
  listAdAccounts,
  listConnections,
} from "@/lib/db/connections.server";
import { purgeMetaData } from "./purge.server";

function b64urlToBytes(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function parseSignedRequest(
  signedRequest: string,
): Promise<{ user_id?: string; [key: string]: unknown } | null> {
  const secret = process.env["META_APP_SECRET"];
  if (!secret) return null;

  const [sigPart, payloadPart] = signedRequest.split(".");
  if (!sigPart || !payloadPart) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sigPart),
    new TextEncoder().encode(payloadPart),
  );
  if (!valid) return null;

  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadPart)));
  } catch {
    return null;
  }
}

/**
 * Remove everything stored for one Meta user id: the login, its ad accounts and pages, and the
 * mirrored ads / change log for those accounts. When the app user has no other Meta login left,
 * every Meta-derived row for that user goes too (sync runs, retries, webhook events).
 */
export async function purgeMetaUser(metaUserId: string) {
  const conns = await findConnectionsByMetaUser(metaUserId);

  for (const conn of conns) {
    const accountIds = (await listAdAccounts(conn.user_id))
      .filter((a) => a.connection_id === conn.id)
      .map((a) => a.account_id);

    await deleteConnections(conn.user_id, conn.id); // cascades ad accounts + pages
    const remaining = await listConnections(conn.user_id);
    // Removing the app in Facebook settings takes everything from Meta, limits included.
    await purgeMetaData(conn.user_id, remaining.length ? accountIds : "all", { settings: true });
  }

  return conns.length;
}
