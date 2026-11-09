import { createSign, generateKeyPairSync } from "node:crypto";
import { expect, test } from "vitest";
import { staticKeyResolver, verifyIdTokenWith } from "@/lib/auth/firebase-token.server";

const PROJECT = "example-project";
const KID = "test-kid";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const resolve = staticKeyResolver(KID, publicKey);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function mint(
  payload: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  signWith = privateKey,
) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: KID, typ: "JWT", ...header });
  const p = b64({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: "uid-123",
    email: "a@b.c",
    email_verified: true,
    iat: now - 10,
    auth_time: now - 10,
    exp: now + 3600,
    ...payload,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${h}.${p}`);
  signer.end();
  return `${h}.${p}.${signer.sign(signWith).toString("base64url")}`;
}

test("accepts a well-formed token and returns the uid and email", async () => {
  expect(await verifyIdTokenWith(mint(), PROJECT, resolve)).toEqual({
    uid: "uid-123",
    email: "a@b.c",
    emailVerified: true,
  });
});

test("rejects a token signed by a different key", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await expect(verifyIdTokenWith(mint({}, {}, other), PROJECT, resolve)).rejects.toThrow(
    "signature is invalid",
  );
});

test("rejects an unknown key id", async () => {
  await expect(verifyIdTokenWith(mint({}, { kid: "other" }), PROJECT, resolve)).rejects.toThrow(
    "unknown key",
  );
});

test("rejects a tampered payload", async () => {
  const token = mint();
  const [h, , s] = token.split(".");
  const forged = b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: "admin", exp: 9_999_999_999 });
  await expect(verifyIdTokenWith(`${h}.${forged}.${s}`, PROJECT, resolve)).rejects.toThrow(
    "signature is invalid",
  );
});

test("rejects the alg=none downgrade", async () => {
  const h = b64({ alg: "none", kid: KID });
  const p = b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: "x", exp: 9_999_999_999 });
  await expect(verifyIdTokenWith(`${h}.${p}.`, PROJECT, resolve)).rejects.toThrow(
    "Unexpected token algorithm",
  );
});

test("rejects another project's audience and issuer", async () => {
  await expect(verifyIdTokenWith(mint({ aud: "other-project" }), PROJECT, resolve)).rejects.toThrow(
    "audience does not match",
  );
  await expect(
    verifyIdTokenWith(mint({ iss: "https://securetoken.google.com/other" }), PROJECT, resolve),
  ).rejects.toThrow("another Firebase project");
});

test("rejects expired and future-dated tokens", async () => {
  const past = Math.floor(Date.now() / 1000) - 7200;
  await expect(verifyIdTokenWith(mint({ exp: past }), PROJECT, resolve)).rejects.toThrow("expired");
  const future = Math.floor(Date.now() / 1000) + 7200;
  await expect(verifyIdTokenWith(mint({ iat: future }), PROJECT, resolve)).rejects.toThrow(
    "issued in the future",
  );
});

test("rejects malformed input and a missing subject", async () => {
  await expect(verifyIdTokenWith("not-a-token", PROJECT, resolve)).rejects.toThrow("Malformed");
  await expect(verifyIdTokenWith("a.b.c", PROJECT, resolve)).rejects.toThrow("Malformed");
  await expect(verifyIdTokenWith(mint({ sub: "" }), PROJECT, resolve)).rejects.toThrow("no subject");
});
