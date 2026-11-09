export const CTA_OPTIONS = [
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "BOOK_TRAVEL", label: "Book Now" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "WHATSAPP_MESSAGE", label: "Send WhatsApp Message" },
  { value: "MESSAGE_PAGE", label: "Send Message" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "SUBSCRIBE", label: "Subscribe" },
] as const;

export const DESTINATIONS = [
  { value: "website", label: "Website link", hint: "Send people to a page you own." },
  { value: "whatsapp", label: "WhatsApp", hint: "Open a WhatsApp chat with your business number." },
  { value: "facebook_page", label: "Facebook Page", hint: "Send people to your Page." },
  { value: "messenger", label: "Messenger", hint: "Open a Messenger thread with your Page." },
] as const;

export type DestinationValue = (typeof DESTINATIONS)[number]["value"];

export const ACCOUNT_STATUS: Record<number, string> = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending review",
  8: "Pending closure",
  9: "Grace period",
  100: "Closed",
  101: "Any active",
  201: "Pending",
};

export const money = (minorUnits: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((minorUnits ?? 0) / 100);

export const isRunning = (status: string) => status?.toUpperCase() === "ACTIVE";

export const OBJECTIVES = [
  {
    value: "OUTCOME_TRAFFIC",
    label: "Traffic",
    hint: "Send the most people to your link for the lowest cost.",
  },
  {
    value: "OUTCOME_ENGAGEMENT",
    label: "Engagement",
    hint: "Get likes, comments, shares and messages on your ad.",
  },
  {
    value: "OUTCOME_AWARENESS",
    label: "Awareness",
    hint: "Show the ad to as many people as possible.",
  },
] as const;

export const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "NL", label: "Netherlands" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "IN", label: "India" },
  { value: "PK", label: "Pakistan" },
  { value: "BD", label: "Bangladesh" },
  { value: "SG", label: "Singapore" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "ZA", label: "South Africa" },
] as const;

/**
 * Work out what a pasted destination means. The inline editor takes one free-text box, so a
 * bare domain like "example.com/offer" must not be mistaken for a WhatsApp number.
 */
export function classifyDestination(raw: string): {
  destination: DestinationValue;
  value: string;
} {
  const input = raw.trim();

  if (/^https?:\/\//i.test(input)) {
    const host = input.replace(/^https?:\/\//i, "").toLowerCase();
    if (host.startsWith("m.me/")) return { destination: "messenger", value: input };
    if (/^(www\.)?(facebook|fb)\.com\//.test(host)) return { destination: "facebook_page", value: input };
    if (/^(api|wa)\.(whatsapp|me)\.com?\//.test(host) || host.startsWith("wa.me/")) {
      const digits = input.replace(/\D/g, "");
      return { destination: "whatsapp", value: digits };
    }
    return { destination: "website", value: input };
  }

  if (/^m\.me\//i.test(input)) return { destination: "messenger", value: `https://${input}` };
  if (/^(www\.)?(facebook|fb)\.com\//i.test(input)) {
    return { destination: "facebook_page", value: `https://${input}` };
  }
  if (/^wa\.me\//i.test(input)) return { destination: "whatsapp", value: input.replace(/\D/g, "") };

  // A phone number: digits with the usual separators, and no domain-looking parts.
  const digits = input.replace(/\D/g, "");
  if (/^\+?[\d\s()./-]{7,22}$/.test(input) && digits.length >= 7 && digits.length <= 15) {
    return { destination: "whatsapp", value: digits };
  }

  // Anything else with a dot is a domain the user typed without a scheme.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(input)) {
    return { destination: "website", value: `https://${input}` };
  }

  return { destination: "website", value: input };
}
