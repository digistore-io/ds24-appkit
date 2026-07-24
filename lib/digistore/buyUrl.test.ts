import { describe, it, expect } from "vitest";
import {
  buildBuyUrlBody,
  offerHash,
  isUnknownAffiliateError,
  isUserSpecific,
  type Offer,
} from "./buyUrl";
import { buildIdentity } from "./custom";
import { tokenCustomMarker } from "@/lib/tokens/packages";

const monthly: Offer = {
  key: "gold",
  productId: "123456",
  priceCents: 900,
  billingInterval: "1_month",
  title: "Paid Challenge - Gold",
  description: "Gold plan (monthly)",
};

describe("buildBuyUrlBody", () => {
  it("setzt Custom Payment Plan mit Euro-Preis und Abo (installments=0)", () => {
    const b = buildBuyUrlBody(monthly);
    expect(b.get("product_id")).toBe("123456");
    expect(b.get("valid_until")).toBe("24h");
    expect(b.get("payment_plan[first_amount]")).toBe("9.00");
    expect(b.get("payment_plan[other_amounts]")).toBe("9.00");
    expect(b.get("payment_plan[currency]")).toBe("EUR");
    expect(b.get("payment_plan[number_of_installments]")).toBe("0");
    expect(b.get("payment_plan[first_billing_interval]")).toBe("1_month");
  });

  it("behandelt Einmalzahlung als installments=1 ohne Intervall", () => {
    const b = buildBuyUrlBody({ key: "einmal", productId: "9", priceCents: 4700 });
    expect(b.get("payment_plan[number_of_installments]")).toBe("1");
    expect(b.get("payment_plan[first_billing_interval]")).toBeNull();
    expect(b.get("payment_plan[first_amount]")).toBe("47.00");
  });

  it("carries over placeholders and the thank-you URL", () => {
    const b = buildBuyUrlBody(monthly, {}, "https://app.example/optin/[ORDER_ID]");
    expect(b.get("placeholders[TITLE]")).toBe("Paid Challenge - Gold");
    expect(b.get("placeholders[DESCRIPTION]")).toBe("Gold plan (monthly)");
    expect(b.get("urls[thankyou_url]")).toBe(
      "https://app.example/optin/[ORDER_ID]",
    );
  });

  it("setzt Upgrade-Parameter und blendet Double-Buy-Hinweis aus", () => {
    const b = buildBuyUrlBody(monthly, {
      upgradeOrderId: "ORD-9",
      upgradeType: "downgrade",
    });
    expect(b.get("payment_plan[upgrade_order_id]")).toBe("ORD-9");
    expect(b.get("payment_plan[upgrade_type]")).toBe("downgrade");
    expect(b.get("settings[hide_double_buy_info]")).toBe("Y");
  });

  it("prefills buyer fields and protects the email address", () => {
    const b = buildBuyUrlBody(monthly, {
      buyer: { email: "k@test.de", firstName: "Erika" },
    });
    expect(b.get("buyer[email]")).toBe("k@test.de");
    expect(b.get("buyer[readonly_keys]")).toBe("email");
    expect(b.get("buyer[first_name]")).toBe("Erika");
  });

  it("nutzt trackingkey ohne Affiliate, campaignkey mit Affiliate", () => {
    const ohneAff = buildBuyUrlBody(monthly, { campaignKey: "sommer" });
    expect(ohneAff.get("tracking[trackingkey]")).toBe("sommer");
    const mitAff = buildBuyUrlBody(monthly, {
      affiliate: "partner1",
      campaignKey: "sommer",
    });
    expect(mitAff.get("tracking[affiliate]")).toBe("partner1");
    expect(mitAff.get("tracking[campaignkey]")).toBe("sommer");
  });
});

describe("offerHash", () => {
  it("is stable for the same offering", () => {
    expect(offerHash(monthly)).toBe(offerHash({ ...monthly }));
  });
  it("changes when the price changes (→ new URL)", () => {
    expect(offerHash(monthly)).not.toBe(
      offerHash({ ...monthly, priceCents: 1900 }),
    );
  });
  it("changes with the thank-you URL", () => {
    expect(offerHash(monthly, "https://a/[ORDER_ID]")).not.toBe(
      offerHash(monthly, "https://b/[ORDER_ID]"),
    );
  });

  it("changes with the custom marker", () => {
    // customTracking is cacheable (it does not make a URL user-specific) and
    // ends up inside the generated URL. Were it missing from the hash, two
    // token packages sharing an offerKey would serve each other's cached URL
    // and credit the wrong balance.
    expect(offerHash(monthly, undefined, "tokens:pro")).not.toBe(
      offerHash(monthly, undefined, "tokens:business"),
    );
    expect(offerHash(monthly, undefined, "tokens:pro")).toBe(
      offerHash(monthly, undefined, "tokens:pro"),
    );
  });
});

describe("isUnknownAffiliateError", () => {
  it("recognizes the affiliate we sent in the message", () => {
    const err = new Error("The user 'partner1' is not known at digistore24.com");
    expect(isUnknownAffiliateError(err, "partner1")).toBe(true);
  });

  it("leaves unrelated failures alone", () => {
    // The point of the narrow check: a network or key problem must NOT be
    // retried away without the affiliate and reported as the second error.
    expect(isUnknownAffiliateError(new Error("fetch failed"), "partner1")).toBe(
      false,
    );
    expect(
      isUnknownAffiliateError(
        new Error("Digistore24 API HTTP 401 (createBuyUrl)"),
        "partner1",
      ),
    ).toBe(false);
  });

  it("is false without an affiliate", () => {
    expect(isUnknownAffiliateError(new Error("anything"), "")).toBe(false);
  });
});

describe("isUserSpecific", () => {
  it("is true for a checkout carrying a buyer identity", () => {
    const ref = buildIdentity({
      memberId: "9f3c1b7e-5d21-4a88-b0c4-2e6f7a1d9c30",
      checkoutToken: "a7Kd2Pq9Zx",
      productKey: "pro",
    });
    expect(isUserSpecific({ customTracking: ref })).toBe(true);
  });

  it("is false for a token marker — those URLs stay shared", () => {
    // The whole point of testing customTracking by content: token packages
    // set it on every offering. A presence check here would uncache every
    // token card and turn each page render into a live Digistore24 call.
    expect(isUserSpecific({ customTracking: tokenCustomMarker("pro") })).toBe(
      false,
    );
  });

  it("is false for an empty context", () => {
    expect(isUserSpecific({})).toBe(false);
  });

  it("still recognises the other user-specific fields", () => {
    expect(isUserSpecific({ buyer: { email: "a@b.de" } })).toBe(true);
    expect(isUserSpecific({ affiliate: "partner" })).toBe(true);
    expect(isUserSpecific({ campaignKey: "spring" })).toBe(true);
    expect(isUserSpecific({ trackingKey: "abc" })).toBe(true);
    expect(isUserSpecific({ upgradeOrderId: "4711" })).toBe(true);
  });
});
