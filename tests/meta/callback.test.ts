import { expect, test } from "vitest";
import { handleMetaCallback, META_STATE_COOKIE } from "@/lib/meta/callback.server";

const callback = (cookie?: string) =>
  handleMetaCallback(
    new Request("https://ads.example/api/public/meta/callback?code=c&state=S1", {
      headers: cookie ? { cookie } : {},
    }),
  );

test("refuses a callback from a browser that didn't start the flow", async () => {
  // Rejected before the database is touched: there is none in this test.
  for (const cookie of [undefined, `${META_STATE_COOKIE}=S2`, `other=S1`]) {
    const res = await callback(cookie);
    expect(await res.text()).toContain("Start again from this browser");
  }
});
