// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Shared helpers for the product registry (config/digistore-products.json).
// Reading/writing the config, so that sync-products & request-approval use the
// same source as the app (lib/digistore/products.ts).
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const CONFIG_URL = new URL(
  "../../config/digistore-products.json",
  import.meta.url,
);
export const CONFIG_PATH = fileURLToPath(CONFIG_URL);

export function readProducts() {
  const json = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (!json || typeof json.products !== "object") {
    throw new Error("Invalid config/digistore-products.json (no products object).");
  }
  return json;
}

/**
 * Products whose kind the configured `billingMode` switched off — the check
 * `lib/billing-mode.test.ts` makes, repeated at the moment it actually costs
 * money.
 *
 * The test only runs on `node run.mjs test`; THIS runs on the command that
 * publishes. Creating a token package for an app whose mode is
 * "subscriptions" puts a product on sale at Digistore24 that the app renders
 * nothing for — the buyer pays and is credited nothing. So the sync refuses
 * instead of asking.
 *
 * A duplicate of the logic in lib/billing-mode.ts on purpose: the scripts are
 * plain `.mjs` and do not import the app's TypeScript. Change one, change the
 * other — the same twin rule `_public-url.mjs` carries.
 */
export function contradictingProducts(json) {
  const mode = json.billingMode;
  // Unknown or missing behaves like "both" — the app's fallback, and the
  // harmless direction: a typo must not block a sync.
  if (mode !== "subscriptions" && mode !== "tokens") return [];
  return Object.entries(json.products)
    .filter(([, p]) =>
      p.kind === "token" ? mode === "subscriptions" : mode === "tokens",
    )
    .map(([key]) => key);
}

/** Writes the config back, formatted (2 spaces, trailing newline). */
export function writeProducts(json) {
  writeFileSync(CONFIG_PATH, JSON.stringify(json, null, 2) + "\n");
}

/** listProducts (readonly) → normalized list. */
export function extractProducts(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.products)) return data.products;
  return [];
}

export function idOf(p) {
  return p.product_id ?? p.id ?? null;
}
