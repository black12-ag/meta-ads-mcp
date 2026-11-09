import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { resetDatabase, testPool } from "../setup/db";
import {
  notifyAccountAlerts,
  notifyAiAppConnected,
  notifyApprovalRequested,
  notifyChangeApplied,
  notifyMetaNeedsReconnect,
  notifyWelcome,
} from "@/lib/email/notify.server";

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
  Response.json({ id: "em_test" }),
);

beforeAll(async () => {
  await resetDatabase();
  await testPool.query(
    `INSERT INTO profiles (id, email) VALUES
       ('owner', 'owner@example.com'), ('other', 'other@example.com'), ('no-mail', NULL)`,
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockClear();
});

const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
const logRows = async (kind: string) =>
  (
    await testPool.query(
      "SELECT user_id, ref, provider_id, ok, error FROM email_log WHERE kind = $1 ORDER BY created_at",
      [kind],
    )
  ).rows;

test("welcome goes out once ever", async () => {
  expect(await notifyWelcome("owner")).toEqual({ ok: true, id: "em_test" });
  expect(await notifyWelcome("owner")).toEqual({ ok: false, reason: "duplicate" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(bodies()[0]).toMatchObject({
    to: ["owner@example.com"],
    subject: "Welcome to Viral4All Ads",
  });
  expect(await logRows("welcome")).toEqual([
    { user_id: "owner", ref: null, provider_id: "em_test", ok: true, error: null },
  ]);
});

test("Meta reconnect goes out at most once per 24 hours per user", async () => {
  const why = { reason: "Your Meta access token expired." };
  expect((await notifyMetaNeedsReconnect("owner", why)).ok).toBe(true);
  expect(await notifyMetaNeedsReconnect("owner", why)).toEqual({ ok: false, reason: "duplicate" });
  expect((await notifyMetaNeedsReconnect("other", why)).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  await testPool.query(
    "UPDATE email_log SET created_at = now() - interval '25 hours' WHERE kind = 'metaNeedsReconnect'",
  );
  expect((await notifyMetaNeedsReconnect("owner", why)).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("approval email goes out once per pending request", async () => {
  const request = {
    id: "6f1c2d3e-0000-4000-8000-000000000001",
    actionTitle: "Change a budget",
    headline: "ShegerPay — Traffic: daily budget $1.00 → $25.00",
    requester: "Claude",
    base: "https://ads.viral4all.com",
  };
  const other = { ...request, id: "6f1c2d3e-0000-4000-8000-000000000002" };
  expect((await notifyApprovalRequested("owner", request)).ok).toBe(true);
  expect(await notifyApprovalRequested("owner", request)).toEqual({
    ok: false,
    reason: "duplicate",
  });
  expect((await notifyApprovalRequested("owner", other)).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  const [first] = bodies();
  expect(first.subject).toBe("Approval needed: Change a budget");
  expect(first.html).toContain(`href="https://ads.viral4all.com/approve/${request.id}"`);
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
    "Idempotency-Key": `approvalRequested/owner/${request.id}`,
  });
  expect((await logRows("approvalRequested")).map((r) => r.ref)).toEqual([request.id, other.id]);
});

test("an app notice is de-duplicated only when a grant ref is given", async () => {
  await notifyAiAppConnected("owner", { appName: "Claude", canWrite: true, ref: "client-1" });
  await notifyAiAppConnected("owner", { appName: "Claude", canWrite: true, ref: "client-1" });
  await notifyAiAppConnected("owner", { appName: "Cursor", canWrite: false });
  await notifyAiAppConnected("owner", { appName: "Cursor", canWrite: false });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("account alerts go out once per ad account per day", async () => {
  const alerts = {
    accountId: "111",
    accountName: "ShegerPay",
    day: "2026-10-22",
    findings: [
      {
        kind: "ctr_drop",
        severity: "warn" as const,
        title: "Click-through rate dropped",
        detail: "Yesterday's click-through rate was 0.80%.",
      },
    ],
  };
  expect((await notifyAccountAlerts("owner", alerts)).ok).toBe(true);
  expect(await notifyAccountAlerts("owner", alerts)).toEqual({ ok: false, reason: "duplicate" });
  expect((await notifyAccountAlerts("owner", { ...alerts, accountId: "222" })).ok).toBe(true);
  expect((await notifyAccountAlerts("owner", { ...alerts, day: "2026-10-23" })).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(3);

  expect(bodies()[0].subject).toBe("ShegerPay: Click-through rate dropped");
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
    "Idempotency-Key": "accountAlerts/owner/111:2026-10-22",
  });
  expect((await logRows("accountAlerts")).map((r) => r.ref)).toEqual([
    "111:2026-10-22",
    "222:2026-10-22",
    "111:2026-10-23",
  ]);
});

test("users without an email are skipped quietly and nothing is logged", async () => {
  expect(await notifyWelcome("no-mail")).toEqual({ ok: false, reason: "no-email" });
  expect(await notifyWelcome("nobody")).toEqual({ ok: false, reason: "no-email" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await logRows("welcome")).map((r) => r.user_id)).toEqual(["owner"]);
});

test("a failed send is logged in email_log and counts as the one attempt", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockResolvedValueOnce(Response.json({ message: "Internal error" }, { status: 500 }));
  expect(await notifyWelcome("other")).toEqual({
    ok: false,
    reason: "failed",
    error: "Resend 500: Internal error",
  });
  expect((await logRows("welcome")).at(-1)).toEqual({
    user_id: "other",
    ref: null,
    provider_id: null,
    ok: false,
    error: "Resend 500: Internal error",
  });
  expect(await notifyWelcome("other")).toEqual({ ok: false, reason: "duplicate" });
  logged.mockRestore();
});

test("without a key the attempt is logged as disabled and nothing is fetched", async () => {
  vi.stubEnv("RESEND_API_KEY", undefined);
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const result = await notifyChangeApplied("other", {
    id: "6f1c2d3e-0000-4000-8000-000000000003",
    headline: "Ad set 1: daily budget $10.00 → $25.00",
    ok: true,
    base: "https://ads.viral4all.com",
  });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  info.mockRestore();
  expect(result).toEqual({ ok: false, reason: "disabled" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await logRows("changeApplied")).toMatchObject([{ ok: false, error: "disabled" }]);
});

test("a database failure is logged and returned, never thrown", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  await testPool.query("ALTER TABLE email_log RENAME TO email_log_away");
  try {
    await expect(notifyMetaNeedsReconnect("other", { reason: "x" })).resolves.toMatchObject({
      ok: false,
      reason: "failed",
    });
  } finally {
    await testPool.query("ALTER TABLE email_log_away RENAME TO email_log");
  }
  expect(fetchMock).not.toHaveBeenCalled();
  expect(logged).toHaveBeenCalledWith(
    expect.stringMatching(/^\[email\] metaNeedsReconnect failed: /),
  );
  logged.mockRestore();
});
