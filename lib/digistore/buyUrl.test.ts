import { describe, it, expect } from "vitest";
import { buildBuyUrlBody, offerHash, type Offer } from "./buyUrl";

const monthly: Offer = {
  key: "gold",
  productId: "123456",
  priceCents: 900,
  billingInterval: "1_month",
  title: "Paid Challenge - Gold",
  description: "Gold-Tarif (monatlich)",
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

  it("übernimmt Platzhalter und Thank-You-URL", () => {
    const b = buildBuyUrlBody(monthly, {}, "https://app.example/optin/[ORDER_ID]");
    expect(b.get("placeholders[TITLE]")).toBe("Paid Challenge - Gold");
    expect(b.get("placeholders[DESCRIPTION]")).toBe("Gold-Tarif (monatlich)");
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

  it("belegt Käuferfelder vor und schützt die E-Mail", () => {
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
  it("ist stabil bei gleichem Angebot", () => {
    expect(offerHash(monthly)).toBe(offerHash({ ...monthly }));
  });
  it("ändert sich, wenn sich der Preis ändert (→ neue URL)", () => {
    expect(offerHash(monthly)).not.toBe(
      offerHash({ ...monthly, priceCents: 1900 }),
    );
  });
  it("ändert sich mit der Thank-You-URL", () => {
    expect(offerHash(monthly, "https://a/[ORDER_ID]")).not.toBe(
      offerHash(monthly, "https://b/[ORDER_ID]"),
    );
  });
});
