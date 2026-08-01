// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  allProducts,
  findProduct,
  getProduct,
  productsByKind,
  hasProductId,
  productId,
  productByDs24Id,
  unknownKindProblems,
  PRODUCT_KINDS,
  productIdsOf,
  productLanguages,
  checkoutProductFor,
  formatPrice,
  intervalKey,
  type ProductDef,
} from "./products";

// Ein Key AUS der Registry, nicht einer aus dem Template.
//
// Die Registry ist die Datei, die der Kunde umbaut — das steht in ihrem eigenen
// `_comment`, und wer nur Abos verkauft, loescht die Token-Pakete daraus. Ein
// Test, der auf "pro" oder "starter" festgenagelt ist, wird dann rot und sieht
// aus wie ein Fehler in der App. Geprueft gehoert die FORM dessen, was die
// Registry haelt, nicht ihr Auslieferungszustand.
//
// `null` bei leerer Registry: auch das ist ein legitimer Zwischenstand — die
// Planseite hat einen EmptyState genau dafuer.
function someProduct(kind?: ProductDef["kind"]): ProductDef | null {
  const all = kind ? productsByKind(kind) : allProducts();
  return all[0] ?? null;
}

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
    const any = someProduct();
    if (any) expect(getProduct(any.key).key).toBe(any.key);
    expect(() => getProduct("gibtsnicht")).toThrow();
  });

  it("jedes Token-Paket hat ein Guthaben", () => {
    // Die Bedingung, an der lib/tokens/packages.ts sonst wirft: ein
    // kind="token" ohne `credits` ist ein Paket, das nichts gutschreibt.
    for (const pkg of productsByKind("token")) {
      expect(pkg.credits, pkg.key).toBeGreaterThan(0);
    }
  });

  it("findProduct liefert null statt zu werfen — auch fuer Prototyp-Keys", () => {
    const any = someProduct();
    if (any) expect(findProduct(any.key)?.key).toBe(any.key);
    // Der Fall, fuer den es die Funktion gibt: ein Key, den die Registry nicht
    // (mehr) fuehrt, weil er umbenannt oder geloescht wurde.
    expect(findProduct("gibtsnicht")).toBeNull();
    // Der Object.hasOwn-Schutz gilt hier genauso wie in getProduct().
    for (const key of ["constructor", "__proto__", "toString", "valueOf"]) {
      expect(findProduct(key)).toBeNull();
    }
  });

  it("filtert nach Typ", () => {
    const tokens = productsByKind("token");
    expect(tokens.every((p) => p.kind === "token")).toBe(true);
    const subs = productsByKind("subscription");
    expect(subs.every((p) => p.kind === "subscription")).toBe(true);
  });

  it("meldet fehlende productId und wirft bei productId()", () => {
    // Vor dem Sync sind die productIds Platzhalter (null) — danach nicht mehr,
    // denn sync-products.mjs schreibt sie in genau diese Datei zurueck. Also
    // wird die Verknuepfung geprueft, nicht der eine oder andere Zustand:
    // fehlt die id, muss productId() werfen und auf den Sync zeigen.
    for (const product of allProducts()) {
      if (hasProductId(product.key)) {
        expect(productId(product.key)).toBeTruthy();
      } else {
        expect(() => productId(product.key)).toThrow(/ds24-sync/);
      }
    }
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

// Ein Digistore24-Produkt traegt GENAU EINE Sprache, und diese Sprache ist die
// Sprache des Bestellformulars — createBuyUrl kann sie nicht ueberschreiben.
// Eine zweisprachige App braucht deshalb zwei Produkte pro Angebot. Diese
// Tests halten die Aufloesung fest; das Begleitwissen steht in products.ts.
describe("Sprache → Digistore24-Produkt", () => {
  const zweisprachig: ProductDef = {
    key: "pro",
    name: "Pro",
    kind: "token",
    productIdByLanguage: { de: "111", en: "222" },
  };

  it("schickt jeden Kaeufer auf das Produkt SEINER Sprache", () => {
    expect(checkoutProductFor(zweisprachig, "de")).toEqual({
      productId: "111",
      language: "de",
    });
    expect(checkoutProductFor(zweisprachig, "en")).toEqual({
      productId: "222",
      language: "en",
    });
  });

  it("faellt auf die Standardsprache zurueck statt den Verkauf zu verweigern", () => {
    // Ein Angebot, das es auf Franzoesisch nicht gibt, bleibt kaufbar — der
    // Kaeufer bekommt nur ein Formular in der falschen Sprache. Die Luecke
    // meldet `node run.mjs ds24-sync`, nicht die Kasse.
    expect(checkoutProductFor(zweisprachig, "fr")?.language).toBe("de");
  });

  it("nimmt irgendein vorhandenes Produkt, wenn auch die Standardsprache fehlt", () => {
    const nurEnglisch: ProductDef = {
      key: "pro",
      name: "Pro",
      kind: "token",
      productIdByLanguage: { en: "222" },
    };
    expect(checkoutProductFor(nurEnglisch, "de")).toEqual({
      productId: "222",
      language: "en",
    });
  });

  it("antwortet null, solange gar nichts synchronisiert ist", () => {
    // "noch nicht angelegt" und "in dieser Sprache nicht verkauft" sind zwei
    // verschiedene Zustaende — nur der erste ist ein Fehler.
    const frisch: ProductDef = {
      key: "pro",
      name: "Pro",
      kind: "token",
      productIdByLanguage: { de: null, en: null },
    };
    expect(checkoutProductFor(frisch, "de")).toBeNull();
    expect(productLanguages(frisch)).toEqual([]);
  });

  it("liest die alte Ein-Produkt-Form weiter (vor Template 0.6.0)", () => {
    // Eine Registry aus der Zeit vor der Sprach-Aufteilung muss weiter
    // verkaufen, ohne dass jemand sie von Hand umbaut.
    const alt: ProductDef = {
      key: "pro",
      name: "Pro",
      kind: "token",
      language: "en",
      productId: "999",
    };
    expect(productIdsOf(alt)).toEqual({ en: "999" });
    expect(checkoutProductFor(alt, "de")?.productId).toBe("999");
  });

  it("laesst die Karte gewinnen, wenn eine Registry mitten in der Migration steht", () => {
    // Beides gesetzt: `productIdByLanguage` ist das, was ds24-sync pflegt.
    const gemischt: ProductDef = {
      key: "pro",
      name: "Pro",
      kind: "token",
      language: "de",
      productId: "alt",
      productIdByLanguage: { de: "neu", en: "222" },
    };
    expect(productIdsOf(gemischt)).toEqual({ de: "neu", en: "222" });
  });

  it("ohne Sprachangabe gilt die Standardsprache", () => {
    const ohne: ProductDef = { key: "pro", name: "Pro", kind: "token", productId: "999" };
    expect(productLanguages(ohne)).toEqual(["de"]);
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

  it("finds an offering by ANY of its language products", () => {
    // The one that costs money if it regresses: a German and an English buyer
    // arrive on two different Digistore24 products, and the IPN names the one
    // they actually bought. Matching only the first id would leave every
    // English purchase unattributed — and `orders.productKey` is never
    // reconstructed afterwards.
    const bilingual: ProductDef[] = [
      { key: "pro", name: "Pro", kind: "token", productIdByLanguage: { de: "111", en: "222" } },
      { key: "basis", name: "Basis", kind: "subscription", productIdByLanguage: { de: "333" } },
    ];
    expect(productByDs24Id("111", bilingual)?.key).toBe("pro");
    expect(productByDs24Id("222", bilingual)?.key).toBe("pro");
    expect(productByDs24Id("333", bilingual)?.key).toBe("basis");
  });

  it("does not call two languages of ONE offering ambiguous", () => {
    // Two offerings sharing an id is a refusal; two LANGUAGES of the same
    // offering are one answer, not two.
    const bilingual: ProductDef[] = [
      { key: "pro", name: "Pro", kind: "token", productIdByLanguage: { de: "111", en: "222" } },
    ];
    expect(productByDs24Id("222", bilingual)?.key).toBe("pro");
  });
});

describe("unknownKindProblems — the loader's refusal", () => {
  it("names the entry, the value and the allowed kinds", () => {
    // The realistic input: a hand-edited registry with a hyphen typo. The
    // module-load check turns this into a refusal to start; here the message
    // itself is pinned so it names everything the vendor needs to fix it.
    const problems = unknownKindProblems([{ key: "kurs", kind: "one-time" }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"kurs"');
    expect(problems[0]).toContain('"one-time"');
    expect(problems[0]).toContain("subscription, token, one_time");
  });

  it("reports a missing kind too", () => {
    expect(unknownKindProblems([{ key: "kurs", kind: undefined }])).toHaveLength(1);
  });

  it("stays silent for every declared kind", () => {
    const products = PRODUCT_KINDS.map((kind) => ({ key: kind, kind }));
    expect(unknownKindProblems(products)).toEqual([]);
  });

  it("stays silent for an empty registry", () => {
    // An empty registry is the normal state mid-setup; the empty state on
    // /plans is what reports it, not a load failure.
    expect(unknownKindProblems([])).toEqual([]);
  });
});
