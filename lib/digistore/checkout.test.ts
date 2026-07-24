import { describe, it, expect, afterEach } from "vitest";
import {
  offerFor,
  customTrackingFor,
  optinThankyouUrl,
  checkoutBlockersFor,
  blockerFor,
  type CheckoutBlocker,
} from "./checkout";
import { DEFAULT_REDIR_URL } from "./public-url";
import type { ProductDef } from "./products";

const sub: ProductDef = {
  key: "basis_monatlich",
  name: "Basic (monthly)",
  description: "Full access.",
  kind: "subscription",
  billingInterval: "1_month",
  priceCents: 1900,
  currency: "EUR",
  productId: "111111",
};

const tokens: ProductDef = {
  key: "pro",
  name: "Pro Tokens",
  kind: "token",
  credits: 5000,
  priceCents: 3900,
  currency: "EUR",
  productId: "222222",
};

describe("offerFor", () => {
  it("carries price, currency and interval from the registry", () => {
    const offer = offerFor(sub);
    expect(offer.productId).toBe("111111");
    expect(offer.priceCents).toBe(1900);
    expect(offer.currency).toBe("EUR");
    expect(offer.billingInterval).toBe("1_month");
    expect(offer.title).toBe("Basic (monthly)");
  });

  it("forces stored payment details on token packages", () => {
    // settings[force_rebilling]=Y. Without it there is no chargeable
    // purchase_id, and auto top-up (createBillingOnDemand) cannot work.
    expect(offerFor(tokens).forceRebilling).toBe(true);
    expect(offerFor(sub).forceRebilling).toBe(false);
  });

  it("never gives a token package a billing interval", () => {
    // An interval would make buyUrl.ts derive number_of_installments=0 and turn
    // the one-off purchase into a subscription.
    const stray = { ...tokens, billingInterval: "1_month" };
    expect(offerFor(stray).billingInterval).toBeUndefined();
  });

  it("throws while the product is not synced yet", () => {
    expect(() => offerFor({ ...sub, productId: null })).toThrow(/ds24-sync/);
  });
});

describe("customTrackingFor", () => {
  it("marks token packages so the IPN can book the credit", () => {
    expect(customTrackingFor(tokens)).toBe("tokens:pro");
  });

  it("leaves subscriptions unmarked", () => {
    expect(customTrackingFor(sub)).toBeUndefined();
  });
});

describe("optinThankyouUrl", () => {
  it("keeps the DS24 placeholder literal", () => {
    // [ORDER_ID] is substituted by Digistore24 — we must not encode or fill it.
    expect(optinThankyouUrl("https://app.example")).toBe(
      "https://app.example/optin/[ORDER_ID]",
    );
  });

  it("tolerates a trailing slash", () => {
    expect(optinThankyouUrl("https://app.example/")).toBe(
      "https://app.example/optin/[ORDER_ID]",
    );
  });

  it("returns undefined without APP_URL (DS24 default page applies)", () => {
    expect(optinThankyouUrl(undefined)).toBeUndefined();
    expect(optinThankyouUrl("  ")).toBeUndefined();
  });

  it("sends a local app through the public redirect", () => {
    // DS24 refuses http://localhost outright ("Please only use secure URLs"),
    // and a checkout without a thank-you URL would drop the buyer on the DS24
    // default page instead of /optin — so the local address travels as a
    // redirect address. See lib/digistore/public-url.ts.
    expect(optinThankyouUrl("http://localhost:3000")).toBe(
      `${DEFAULT_REDIR_URL}?port=3000&path=/optin/[ORDER_ID]`,
    );
  });
});

describe("checkoutBlockersFor", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reports notSynced before anything else", async () => {
    delete process.env.DIGISTORE_API_KEY;
    const blockers = await checkoutBlockersFor([{ ...sub, productId: null }]);
    // Not synced wins over not connected: fixing the connection would not
    // help a product that does not exist at Digistore24 yet.
    expect(blockers.get(sub.key)).toBe("notSynced");
  });

  it("reports notConnected when no API key is configured", async () => {
    delete process.env.DIGISTORE_API_KEY;
    const blockers = await checkoutBlockersFor([
      { ...sub, productId: "123456" },
    ]);
    expect(blockers.get(sub.key)).toBe("notConnected");
  });

  it("returns an empty map for an empty list", async () => {
    expect((await checkoutBlockersFor([])).size).toBe(0);
  });

  it("says null — not undefined — when nothing is blocking", async () => {
    // The value blockerFor() below has to survive. If this ever becomes
    // `undefined`, the two cases stop being distinguishable at all.
    process.env.DIGISTORE_API_KEY = "test-key";
    const blockers = await checkoutBlockersFor([{ ...sub, productId: "123456" }]);
    expect(blockers.has(sub.key)).toBe(true);
    expect(blockers.get(sub.key)).toBeNull();
  });
});

describe("blockerFor", () => {
  it("REGRESSION: a plan with nothing wrong is not an error", () => {
    // `blockers.get(key) ?? "error"` was the whole bug: checkoutBlockersFor
    // stores null for a healthy plan, and `null ?? "error"` is "error". Every
    // signed-in visitor got "the checkout is unavailable" on every single card
    // — while signed-out visitors, who take the other branch, saw a perfect
    // page. That is why it survived: nothing anonymous could reproduce it.
    const blockers = new Map<string, CheckoutBlocker | null>([["pro", null]]);

    expect(blockerFor(blockers, "pro")).toBeNull();
  });

  it("passes a real blocker through", () => {
    const blockers = new Map<string, CheckoutBlocker | null>([
      ["a", "notSynced"],
      ["b", "notConnected"],
    ]);
    expect(blockerFor(blockers, "a")).toBe("notSynced");
    expect(blockerFor(blockers, "b")).toBe("notConnected");
  });

  it("calls a genuinely missing plan an error", () => {
    // Absent is not the same as null: nobody resolved this plan, so the page
    // must not offer a button for it.
    expect(blockerFor(new Map(), "ghost")).toBe("error");
  });
});
