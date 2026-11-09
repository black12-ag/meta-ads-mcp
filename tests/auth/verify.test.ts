import { expect, test } from "vitest";
import { verifyBearer } from "@/lib/auth/verify.server";

const fake = async (token: string) => {
  if (token === "good") return { uid: "u1", email: "a@b.c" };
  throw new Error("bad token");
};

test("accepts a Bearer token the verifier likes", async () => {
  expect(await verifyBearer("Bearer good", fake)).toEqual({ uid: "u1", email: "a@b.c" });
});

test("rejects missing, non-Bearer, empty and invalid tokens", async () => {
  await expect(verifyBearer(null, fake)).rejects.toThrow("Unauthorized");
  await expect(verifyBearer("Basic x", fake)).rejects.toThrow("Unauthorized");
  await expect(verifyBearer("Bearer ", fake)).rejects.toThrow("Unauthorized");
  // the verifier's own reason is kept, so server logs say why a token was refused
  await expect(verifyBearer("Bearer nope", fake)).rejects.toThrow("Unauthorized: bad token");
});
