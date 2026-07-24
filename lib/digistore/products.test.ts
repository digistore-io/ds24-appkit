import { describe, it, expect } from "vitest";
import {
  allProducts,
  getProduct,
  productsByKind,
  hasProductId,
  productId,
  productByDs24Id,
  formatPrice,
  intervalKey,
  type ProductDef,
} from "./products";

describe("Produkt-Registry", () => {
  it("reads products including the resolved key", () => {
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

  it("meldet fehlende productId und wirft bei productId()", () => {
    // Im Template sind die productIds Platzhalter (null) — vor dem Sync.
    expect(hasProductId("pro")).toBe(false);
    expect(() => productId("pro")).toThrow(/sync-products/);
  });
});

describe("Preis-Anzeige", () => {
  const abo: ProductDef = {
    key: "test",
    name: "Test",
    kind: "subscription",
    billingInterval: "1_month",
    priceCents: 1900,
    currency: "EUR",
  };

  it("schreibt den Preis in der Konvention der Sprache", () => {
    // Same amount, same currency — only the formatting differs
    // sich. Umgerechnet wird NIE (abgerechnet wird, was bei DS24 steht).
    const de = formatPrice(abo, "de-DE");
    const en = formatPrice(abo, "en-US");
    expect(de).toContain("19");
    expect(en).toContain("19");
    expect(de).not.toBe(en);
  });

  it("liefert null ohne Preis — die Oberflaeche zeigt dann „auf Anfrage“", () => {
    expect(formatPrice({ ...abo, priceCents: undefined }, "de-DE")).toBeNull();
  });

  it("returns the interval as a translation key", () => {
    expect(intervalKey(abo)).toBe("perMonth");
    expect(intervalKey({ ...abo, billingInterval: "12_month" })).toBe("perYear");
    expect(intervalKey({ ...abo, kind: "token" })).toBe("oneTime");
  });

  it("returns null for an unknown interval", () => {
    // The page then shows the raw value instead of leaving a blank.
    expect(intervalKey({ ...abo, billingInterval: "3_month" })).toBeNull();
  });
});

describe("productByDs24Id — the reverse lookup", () => {
  const synced: ProductDef[] = [
    { key: "basis", name: "Basis", kind: "subscription", productId: "111" },
    { key: "pro", name: "Pro", kind: "token", productId: "222" },
  ];
  const unsynced: ProductDef[] = [
    { key: "basis", name: "Basis", kind: "subscription", productId: null },
    { key: "pro", name: "Pro", kind: "token", productId: null },
  ];

  it("finds the offering a Digistore24 product id belongs to", () => {
    // This is what lets an ANONYMOUS purchase — one carrying no `custom` at
    // all — still record what was bought, and later become a grant.
    expect(productByDs24Id("222", synced)?.key).toBe("pro");
  });

  it("does not match an unsynced product when the payload has no id", () => {
    // THE trap. `productId` is null until `node run.mjs ds24-sync` runs. Without the
    // both-sides-non-empty guard, `p.productId === id` with two empty values
    // matches the FIRST unsynced product — granting a plan nobody bought.
    expect(productByDs24Id("", unsynced)).toBeNull();
    expect(productByDs24Id(null, unsynced)).toBeNull();
    expect(productByDs24Id(undefined, unsynced)).toBeNull();
  });

  it("does not match an unsynced product when the payload HAS an id", () => {
    // The other half of the guard: a real id must not fall onto a registry
    // entry that has none.
    expect(productByDs24Id("111", unsynced)).toBeNull();
  });

  it("returns null for an id the registry does not know", () => {
    // Unknown, never wrong. The order keeps its ds24ProductId and stays
    // recoverable once the Operator syncs and attaches it by hand.
    expect(productByDs24Id("999", synced)).toBeNull();
  });

  it("refuses to guess when two offerings share one product id", () => {
    const ambiguous: ProductDef[] = [
      { key: "a", name: "A", kind: "subscription", productId: "555" },
      { key: "b", name: "B", kind: "subscription", productId: "555" },
    ];
    expect(productByDs24Id("555", ambiguous)).toBeNull();
  });

  it("defaults to the real registry", () => {
    // Whatever the shipped config says, an empty id must never resolve.
    expect(productByDs24Id("")).toBeNull();
  });
});
