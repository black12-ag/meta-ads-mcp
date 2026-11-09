import { beforeAll, expect, test } from "vitest";
import { resetDatabase } from "../setup/db";
import { getAppSettings, saveValidation, upsertAppSettings } from "@/lib/db/settings.server";

beforeAll(resetDatabase);

test("settings upsert, get, and validation report", async () => {
  expect(await getAppSettings("u1")).toBeNull();
  await upsertAppSettings("u1", {
    public_base_url: "https://ads.example",
    redirect_path: "/api/public/meta/callback",
    webhook_path: "/api/public/meta/webhook",
    deauthorize_path: "/api/public/meta/deauthorize",
    data_deletion_path: "/api/public/meta/data-deletion",
    verify_token: "tok",
  });
  await upsertAppSettings("u1", {
    public_base_url: "https://ads2.example",
    redirect_path: "/api/public/meta/callback",
    webhook_path: "/api/public/meta/webhook",
    deauthorize_path: "/api/public/meta/deauthorize",
    data_deletion_path: "/api/public/meta/data-deletion",
    verify_token: "tok",
  });
  const s = await getAppSettings("u1");
  expect(s?.public_base_url).toBe("https://ads2.example");
  expect(s?.last_validated_at).toBeNull();

  const ranAt = new Date().toISOString();
  await saveValidation("u1", ranAt, { ok: false, checks: [{ id: "base", ok: false }] });
  const after = await getAppSettings("u1");
  expect(after?.public_base_url).toBe("https://ads2.example");
  expect(after?.last_validated_at).toBe(ranAt);
  expect(after?.last_validation).toEqual({ ok: false, checks: [{ id: "base", ok: false }] });

  // validation for a user with no settings row creates one with defaults
  await saveValidation("u2", ranAt, { ok: true, checks: [] });
  expect((await getAppSettings("u2"))?.redirect_path).toBe("/api/public/meta/callback");
});
