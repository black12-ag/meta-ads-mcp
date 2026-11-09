import { expect, test } from "vitest";
import { classifyDestination } from "@/lib/meta/constants";

test("full URLs stay websites", () => {
  expect(classifyDestination("https://example.com/offer")).toEqual({
    destination: "website",
    value: "https://example.com/offer",
  });
  expect(classifyDestination(" http://shop.example.com/x?a=1 ").destination).toBe("website");
});

test("a domain typed without a scheme becomes a website, not a phone number", () => {
  // this is the bug: "example.com/offer" used to be sent to Meta as a WhatsApp number
  expect(classifyDestination("example.com/offer")).toEqual({
    destination: "website",
    value: "https://example.com/offer",
  });
  expect(classifyDestination("www.example.com")).toEqual({
    destination: "website",
    value: "https://www.example.com",
  });
});

test("phone numbers become WhatsApp, digits only", () => {
  expect(classifyDestination("+251 91 234 5678")).toEqual({
    destination: "whatsapp",
    value: "251912345678",
  });
  expect(classifyDestination("(555) 123-4567")).toEqual({
    destination: "whatsapp",
    value: "5551234567",
  });
  expect(classifyDestination("wa.me/251912345678").destination).toBe("whatsapp");
});

test("messenger and page links are recognised", () => {
  expect(classifyDestination("m.me/mypage")).toEqual({
    destination: "messenger",
    value: "https://m.me/mypage",
  });
  expect(classifyDestination("https://m.me/mypage").destination).toBe("messenger");
  expect(classifyDestination("facebook.com/mypage").destination).toBe("facebook_page");
  expect(classifyDestination("https://www.facebook.com/mypage").destination).toBe("facebook_page");
});

test("too-short and too-long digit strings are not treated as phone numbers", () => {
  expect(classifyDestination("12345").destination).toBe("website");
  expect(classifyDestination("1234567890123456789012").destination).toBe("website");
});
