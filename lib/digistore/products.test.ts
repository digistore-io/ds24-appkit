import { describe, it, expect } from "vitest";
import {
  allProducts,
  getProduct,
  productsByKind,
  hasProductId,
  productId,
  productBuyUrl,
} from "./products";

describe("Produkt-Registry", () => {
  it("liest Produkte samt aufgelöstem key", () => {
    const all = allProducts();
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      expect(p.key).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(["subscription", "token", "one_time"]).toContain(p.kind);
    }
  });

  it("liefert ein Produkt oder wirft bei unbekanntem key", () => {
    const pro = getProduct("pro");
    expect(pro.kind).toBe("token");
    expect(pro.credits).toBeGreaterThan(0);
    expect(() => getProduct("gibtsnicht")).toThrow();
  });

  it("filtert nach Typ", () => {
    const tokens = productsByKind("token");
    expect(tokens.every((p) => p.kind === "token")).toBe(true);
    const subs = productsByKind("subscription");
    expect(subs.every((p) => p.kind === "subscription")).toBe(true);
  });

  it("meldet fehlende productId und wirft bei productId()/productBuyUrl()", () => {
    // Im Template sind die productIds Platzhalter (null) — vor dem Sync.
    expect(hasProductId("pro")).toBe(false);
    expect(() => productId("pro")).toThrow(/sync-products/);
    expect(() => productBuyUrl("pro")).toThrow(/sync-products/);
  });
});
