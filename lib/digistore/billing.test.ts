import { describe, it, expect } from "vitest";
import { buildBillOnDemandBody } from "./billing";

describe("buildBillOnDemandBody", () => {
  it("setzt purchase_id, product_id und einen einmaligen Payment-Plan", () => {
    const body = buildBillOnDemandBody({
      purchaseId: "PUR-1",
      productId: "42",
      priceCents: 900,
    });
    expect(body.get("purchase_id")).toBe("PUR-1");
    expect(body.get("product_id")).toBe("42");
    expect(body.get("payment_plan[first_amount]")).toBe("9.00");
    // One-off extra charge: no follow-up amounts, exactly one installment.
    expect(body.get("payment_plan[other_amounts]")).toBe("0.00");
    expect(body.get("payment_plan[number_of_installments]")).toBe("1");
    expect(body.get("payment_plan[currency]")).toBe("EUR");
    expect(body.get("settings[quantity]")).toBe("1");
  });

  it("rechnet Cent korrekt in Euro-Strings um", () => {
    const body = buildBillOnDemandBody({
      purchaseId: "P",
      productId: "1",
      priceCents: 4999,
      currency: "CHF",
    });
    expect(body.get("payment_plan[first_amount]")).toBe("49.99");
    expect(body.get("payment_plan[currency]")).toBe("CHF");
  });

  it("carries over quantity and the custom marker for the IPN", () => {
    const body = buildBillOnDemandBody({
      purchaseId: "P",
      productId: "1",
      priceCents: 100,
      quantity: 3,
      custom: "tokens:pro",
    });
    expect(body.get("settings[quantity]")).toBe("3");
    expect(body.get("tracking[custom]")).toBe("tokens:pro");
  });

  it("omits affiliate/custom when unset", () => {
    const body = buildBillOnDemandBody({
      purchaseId: "P",
      productId: "1",
      priceCents: 100,
    });
    expect(body.has("tracking[custom]")).toBe(false);
    expect(body.has("tracking[affiliate]")).toBe(false);
  });
});
