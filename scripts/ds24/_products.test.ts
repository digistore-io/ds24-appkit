// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  contradictingProducts,
  productIdsOf,
  languagesOf,
  productTargets,
  setProductId,
} from "./_products.mjs";
import {
  contradictingProducts as appContradictingProducts,
  BILLING_MODES,
  type BillingMode,
} from "@/lib/billing-mode";
import {
  productIdsOf as appProductIdsOf,
  type ProductDef,
} from "@/lib/digistore/products";
import registry from "@/config/digistore-products.json";

// The twin of lib/billing-mode.ts, for the scripts — they are plain `.mjs` and
// do not import the app's TypeScript, so the rule exists twice. This file is
// what keeps the two from drifting apart, the same job
// `_public-url.test.ts` does for the redirect pair.

function config(mode: string | undefined, kinds: Record<string, string>) {
  return {
    billingMode: mode,
    products: Object.fromEntries(
      Object.entries(kinds).map(([key, kind]) => [key, { kind }]),
    ),
  };
}

const MIXED = { abo: "subscription", paket: "token", einmal: "one_time" };

describe("contradictingProducts (script side)", () => {
  it("names the token packages in a subscriptions-only app", () => {
    expect(contradictingProducts(config("subscriptions", MIXED))).toEqual([
      "paket",
    ]);
  });

  it("names the plans in a tokens-only app — one_time counts as a plan", () => {
    // Same dividing line grantableProducts() draws: a one-off purchase is an
    // entitlement, not a balance.
    expect(contradictingProducts(config("tokens", MIXED))).toEqual([
      "abo",
      "einmal",
    ]);
  });

  it("contradicts nothing in a 'both' app", () => {
    expect(contradictingProducts(config("both", MIXED))).toEqual([]);
  });

  it("lets an unknown or missing mode through", () => {
    // The app falls back to "both" on a value it cannot read; a typo must not
    // block a sync — it is caught by lib/billing-mode.test.ts, not here.
    expect(contradictingProducts(config(undefined, MIXED))).toEqual([]);
    expect(contradictingProducts(config("Subscriptions", MIXED))).toEqual([]);
    expect(contradictingProducts(config("abo", MIXED))).toEqual([]);
  });

  it("has nothing to say about an empty registry", () => {
    expect(contradictingProducts(config("tokens", {}))).toEqual([]);
  });
});

describe("script and app agree", () => {
  // The assertion that matters: whatever the shipped registry holds, the
  // refusal in `ds24-sync` and the one in the build have to answer the same.
  it("gives the same answer for the shipped registry", () => {
    expect(contradictingProducts(registry)).toEqual(appContradictingProducts());
  });

  it("gives the same answer for every mode against the shipped products", () => {
    for (const mode of BILLING_MODES) {
      const shifted = { ...registry, billingMode: mode as BillingMode };
      // The app reads its mode from the imported JSON and cannot be told a
      // different one, so the app side is reproduced from the same rule it
      // documents: a token is contradicted by "subscriptions", anything else
      // by "tokens".
      const expected = Object.entries(registry.products)
        .filter(([, p]) =>
          (p as { kind: string }).kind === "token"
            ? mode === "subscriptions"
            : mode === "tokens",
        )
        .map(([key]) => key);
      expect(contradictingProducts(shifted), mode).toEqual(expected);
    }
  });
});

// One Digistore24 product per offering AND language — a DS24 product carries
// exactly one language, and that language is the buyer's order form. The
// scripts have to see the same split the app does (lib/digistore/products.ts),
// or `ds24-sync` creates products the checkout never reaches.
describe("productIdsOf (script side)", () => {
  const bilingual = { productIdByLanguage: { de: "111", en: "222" } };

  it("reads the per-language map", () => {
    expect(productIdsOf(bilingual)).toEqual({ de: "111", en: "222" });
    expect(languagesOf(bilingual)).toEqual(["de", "en"]);
  });

  it("keeps languages that are declared but not created yet", () => {
    // The sync's whole job is to fill exactly those in, so unlike the app side
    // they must survive the read. `null`, not absent.
    expect(productIdsOf({ productIdByLanguage: { de: null, en: null } })).toEqual({
      de: null,
      en: null,
    });
    expect(languagesOf({ productIdByLanguage: { de: null } })).toEqual(["de"]);
  });

  it("reads the pre-0.6.0 single-product shape", () => {
    expect(productIdsOf({ productId: "999", language: "en" })).toEqual({ en: "999" });
    expect(productIdsOf({ productId: "999" })).toEqual({ de: "999" });
  });

  it("answers the same as the app for the same registry entry", () => {
    // The twin rule: two implementations of one decision, pinned against each
    // other rather than trusted. Only the live ids are comparable — the app
    // drops the nulls on purpose, the scripts keep them.
    for (const entry of [
      bilingual,
      { productId: "999", language: "en" },
      { productId: "alt", language: "de", productIdByLanguage: { de: "neu", en: "222" } },
    ]) {
      const live = Object.fromEntries(
        Object.entries(productIdsOf(entry)).filter(([, id]) => id),
      );
      expect(live).toEqual(appProductIdsOf(entry as ProductDef));
    }
  });
});

describe("productTargets — one row per Digistore24 product", () => {
  it("splits a bilingual offering into two rows", () => {
    const targets = productTargets({
      pro: { productIdByLanguage: { de: "111", en: "222" } },
    });
    expect(targets.map((t) => [t.label, t.language, t.productId])).toEqual([
      ["pro (de)", "de", "111"],
      ["pro (en)", "en", "222"],
    ]);
  });

  it("leaves a single-language offering labelled by its bare key", () => {
    // So a German-only app's terminal output is exactly what it always was.
    const targets = productTargets({ pro: { productIdByLanguage: { de: "111" } } });
    expect(targets.map((t) => t.label)).toEqual(["pro"]);
  });

  it("still yields a row for an offering nothing has been created for", () => {
    // Otherwise the very first sync would have nothing to do.
    const targets = productTargets({ pro: {} });
    expect(targets).toHaveLength(1);
    expect(targets[0].productId).toBeNull();
    expect(targets[0].language).toBe("de");
  });
});

describe("setProductId", () => {
  it("writes into the per-language map", () => {
    const config = { products: { pro: { productIdByLanguage: { de: null, en: null } } } };
    setProductId(config, "pro", "en", 222);
    expect(config.products.pro.productIdByLanguage).toEqual({ de: null, en: "222" });
  });

  it("retires the legacy pair once the map covers it", () => {
    // Leaving both behind is how a registry ends up with two answers to "which
    // product is the German one", and every reader would then need a winner.
    const config = { products: { pro: { productId: "999", language: "de" } } };
    setProductId(config, "pro", "de", 111);
    expect(config.products.pro).toEqual({ productIdByLanguage: { de: "111" } });
  });

  it("keeps the legacy pair while the map does not cover its language", () => {
    // Mid-migration: the English product exists, the German one is still only
    // in the old field. Dropping it there would unsync the German checkout.
    const config: {
      products: Record<
        string,
        { productId?: string; language?: string; productIdByLanguage?: Record<string, string> }
      >;
    } = { products: { pro: { productId: "999", language: "de" } } };
    setProductId(config, "pro", "en", 222);
    expect(config.products.pro.productId).toBe("999");
    expect(config.products.pro.productIdByLanguage).toEqual({ en: "222" });
  });
});
