import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import { maybeOne, one, q, transaction, values } from "@/lib/db/pool.server";

beforeAll(resetDatabase);

test("q returns rows, maybeOne returns null on miss, one throws on miss", async () => {
  await q("insert into profiles (id, email) values ($1, $2)", ["u1", "a@b.c"]);
  expect(await q<{ id: string }>("select id from profiles")).toEqual([{ id: "u1" }]);
  expect(await maybeOne("select id from profiles where id=$1", ["nope"])).toBeNull();
  await expect(one("select id from profiles where id=$1", ["nope"])).rejects.toThrow(
    "Expected one row",
  );
});

test("bigint comes back as a number and timestamptz as an ISO string", async () => {
  await q("insert into campaigns (user_id, name, platform, budget_cents) values ('u1','c','meta', 123456)");
  const row = await one<{ budget_cents: number; created_at: string }>(
    "select budget_cents, created_at from campaigns where user_id='u1'",
  );
  expect(row.budget_cents).toBe(123456);
  expect(typeof row.created_at).toBe("string");
  expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test("values builds numbered placeholders", () => {
  expect(values([["a", 1], ["b", 2]])).toEqual({ text: "($1,$2),($3,$4)", params: ["a", 1, "b", 2] });
});

test("transaction rolls back on error", async () => {
  await expect(
    transaction(async (run) => {
      await run("insert into profiles (id) values ('tx1')");
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(await maybeOne("select id from profiles where id='tx1'")).toBeNull();
});
