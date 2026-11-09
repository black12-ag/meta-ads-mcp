import { afterEach, expect, test, vi } from "vitest";
import { sendEmail } from "@/lib/email/resend.server";

const message = {
  to: "owner@example.com",
  kind: "welcome",
  subject: "Welcome to Viral4All Ads",
  html: "<p>Hi</p>",
  text: "Hi",
  idempotencyKey: "welcome/u1",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("without RESEND_API_KEY nothing is fetched", async () => {
  vi.stubEnv("RESEND_API_KEY", undefined);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  expect(await sendEmail(message)).toEqual({ ok: false, reason: "disabled" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith("[email] welcome not sent: RESEND_API_KEY is not set");
  info.mockRestore();
});

test("posts to Resend with the key, the idempotency key and the default sender", async () => {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", undefined);
  vi.stubEnv("EMAIL_REPLY_TO", undefined);
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ id: "em_1" }),
  );
  vi.stubGlobal("fetch", fetchMock);

  expect(await sendEmail(message)).toEqual({ ok: true, id: "em_1" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init?.method).toBe("POST");
  expect(init?.headers).toMatchObject({
    Authorization: "Bearer re_test_key",
    "Idempotency-Key": "welcome/u1",
    "Content-Type": "application/json",
  });
  expect(JSON.parse(String(init?.body))).toEqual({
    from: "Viral4All Ads <alerts@viral4all.com>",
    to: ["owner@example.com"],
    reply_to: "support@viral4all.com",
    subject: "Welcome to Viral4All Ads",
    html: "<p>Hi</p>",
    text: "Hi",
    tags: [{ name: "kind", value: "welcome" }],
    headers: { "X-Entity-Ref-ID": "welcome/u1" },
  });
});

test.each([
  [
    "a 4xx",
    () =>
      Response.json(
        { statusCode: 422, name: "validation_error", message: "Invalid `to` field." },
        { status: 422 },
      ),
    "Resend 422: Invalid `to` field.",
  ],
  ["a 5xx", () => new Response("Bad gateway", { status: 502 }), "Resend 502: no message"],
  [
    "a network error",
    () => {
      throw new TypeError("fetch failed");
    },
    "fetch failed",
  ],
])("%s returns ok:false, logs one line and does not throw", async (_, respond, error) => {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respond()),
  );
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(sendEmail(message)).resolves.toEqual({ ok: false, reason: "failed", error });
  expect(logged).toHaveBeenCalledTimes(1);
  expect(logged).toHaveBeenCalledWith(`[email] welcome failed: ${error}`);
  expect(JSON.stringify(logged.mock.calls)).not.toContain("re_test_key");
  logged.mockRestore();
});
