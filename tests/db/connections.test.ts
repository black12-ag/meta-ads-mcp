import { beforeAll, expect, test } from "vitest";
import { resetDatabase, testPool } from "../setup/db";
import {
  consumeOauthState,
  deleteConnections,
  findConnectionsByMetaUser,
  findUsersByActiveAccount,
  firstAdAccountForConnection,
  firstPageForConnection,
  getConnectionToken,
  getPrimaryConnection,
  insertOauthState,
  listAdAccounts,
  listConnections,
  listConnectionsForSync,
  listPages,
  setPrimaryConnection,
  updateConnection,
  upsertAdAccounts,
  upsertConnection,
  upsertPages,
} from "@/lib/db/connections.server";

beforeAll(resetDatabase);

const conn = (userId: string, metaUserId: string, token: string) =>
  upsertConnection({
    user_id: userId,
    meta_user_id: metaUserId,
    meta_name: "Name",
    meta_picture_url: null,
    access_token: token,
    token_expires_at: null,
  });

test("upsertConnection keeps one row per (user, meta user) and refreshes the token", async () => {
  const a = await conn("u1", "m1", "tok1");
  const b = await conn("u1", "m1", "tok2");
  expect(b.id).toBe(a.id);
  expect(await getConnectionToken(a.id)).toBe("tok2");
  expect(await listConnections("u1")).toHaveLength(1);
});

test("access tokens are encrypted at rest and decrypted on read", async () => {
  const c = await conn("u9", "m9", "plain-secret-token");
  const stored = await testPool.query(`SELECT access_token FROM meta_connections WHERE id = $1`, [
    c.id,
  ]);
  expect(stored.rows[0].access_token).toMatch(/^v1:/);
  expect(stored.rows[0].access_token).not.toContain("plain-secret-token");
  expect(c.access_token).toBe("plain-secret-token");
  expect((await getPrimaryConnection("u9"))?.access_token).toBe("plain-secret-token");

  // rows written before encryption (plaintext) still read back
  await testPool.query(`UPDATE meta_connections SET access_token = 'legacy-tok' WHERE id = $1`, [
    c.id,
  ]);
  expect(await getConnectionToken(c.id)).toBe("legacy-tok");
  await deleteConnections("u9");
});

test("primary selection and updateConnection", async () => {
  const first = await getPrimaryConnection("u1");
  const second = await conn("u1", "m2", "tok3");
  await setPrimaryConnection("u1", second.id);
  expect((await getPrimaryConnection("u1"))?.id).toBe(second.id);
  const flags = await listConnections("u1");
  expect(flags.filter((c) => c.is_primary)).toHaveLength(1);

  await updateConnection(second.id, { active_ad_account_id: "acct1", active_page_id: "page1" });
  const updated = await getPrimaryConnection("u1");
  expect(updated?.active_ad_account_id).toBe("acct1");
  expect(updated?.active_page_id).toBe("page1");
  expect(first?.id).not.toBe(second.id);

  expect(await findUsersByActiveAccount("acct1")).toEqual(["u1"]);
  expect((await listConnectionsForSync()).map((c) => c.access_token).sort()).toEqual([
    "tok2",
    "tok3",
  ]);
  expect((await findConnectionsByMetaUser("m2"))[0].user_id).toBe("u1");
});

test("ad accounts and pages upsert without duplicates and cascade on connection delete", async () => {
  const c = await getPrimaryConnection("u1");
  const acct = {
    user_id: "u1",
    connection_id: c!.id,
    account_id: "111",
    name: "Main",
    currency: "USD",
    timezone_name: null,
    account_status: 1,
    spend_cap_cents: null,
    amount_spent_cents: 500,
    business_name: null,
  };
  await upsertAdAccounts([acct]);
  await upsertAdAccounts([{ ...acct, name: "Main renamed" }]);
  const accounts = await listAdAccounts("u1");
  expect(accounts).toHaveLength(1);
  expect(accounts[0].name).toBe("Main renamed");
  expect(accounts[0].amount_spent_cents).toBe(500);
  expect((await firstAdAccountForConnection("u1", c!.id))?.account_id).toBe("111");

  await upsertPages([
    {
      user_id: "u1",
      connection_id: c!.id,
      page_id: "p1",
      name: "Page",
      category: null,
      picture_url: null,
      tasks: ["ADVERTISE"],
      instagram_business_id: null,
    },
  ]);
  expect((await listPages("u1"))[0].tasks).toEqual(["ADVERTISE"]);
  expect((await firstPageForConnection("u1", c!.id))?.page_id).toBe("p1");

  await deleteConnections("u1", c!.id);
  expect(await listAdAccounts("u1")).toHaveLength(0);
  expect(await listPages("u1")).toHaveLength(0);
  expect(await listConnections("u1")).toHaveLength(1);

  await deleteConnections("u1");
  expect(await listConnections("u1")).toHaveLength(0);
});

test("oauth state is single use", async () => {
  await insertOauthState("st1", "u9", "https://example.test");
  const row = await consumeOauthState("st1");
  expect(row?.user_id).toBe("u9");
  expect(row?.redirect_uri).toBe("https://example.test");
  expect(await consumeOauthState("st1")).toBeNull();
  expect((await testPool.query("select count(*)::int as n from meta_oauth_states")).rows[0].n).toBe(
    0,
  );
});
