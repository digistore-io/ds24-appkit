// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { contradictingProducts } from "./_products.mjs";
import {
  contradictingProducts as appContradictingProducts,
  BILLING_MODES,
  type BillingMode,
} from "@/lib/billing-mode";
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
