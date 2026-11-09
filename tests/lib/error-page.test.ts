import { expect, test } from "vitest";
import { renderErrorPage } from "@/lib/error-page";

test("500 page has a heading, a retry and a way home, with no external assets", () => {
  const html = renderErrorPage();
  expect(html).toContain("<h1>This page didn't load</h1>");
  expect(html).toContain('href="/"');
  expect(html).toContain("location.reload()");
  expect(html).not.toMatch(/(src|href)="https?:/);
});
