// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Shared helpers for the product registry (config/digistore-products.json).
// Reading/writing the config, so that sync-products & request-approval use the
// same source as the app (lib/digistore/products.ts).
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const CONFIG_URL = new URL(
  "../../config/digistore-products.json",
  import.meta.url,
);
export const CONFIG_PATH = fileURLToPath(CONFIG_URL);

const MESSAGES_DIR = fileURLToPath(new URL("../../messages", import.meta.url));

/**
 * The language a registry entry is assumed to be in when it names none. The
 * app's DEFAULT_LOCALE (i18n/config.ts) — the twin rule below applies.
 */
export const FALLBACK_LANGUAGE = "de";

/**
 * The languages the APP speaks, read off `messages/<code>.json`.
 *
 * The truth is `LOCALES` in `i18n/config.ts`, and these scripts are plain
 * `.mjs` that do not import the app's TypeScript (same twin rule as
 * `_public-url.mjs`). The message files are the next-best signal and cannot
 * drift from it: `i18n/messages.test.ts` fails the build when a locale has no
 * file, and a file with no locale would fail on the first render.
 *
 * Used only to WARN — a registry that does not cover a locale still sells.
 */
export function appLanguages() {
  try {
    return readdirSync(MESSAGES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The Digistore24 product ids of one registry entry, by language — the `.mjs`
 * twin of `productIdsOf()` in `lib/digistore/products.ts`. Change one, change
 * the other; `_products.test.ts` pins the shape.
 *
 * Includes languages declared but not created yet (value `null`), because the
 * sync's whole job is to fill exactly those in. Readers that want only the
 * live ones filter for a truthy value.
 *
 * The legacy `productId`/`language` pair from before template 0.6.0 reads as
 * one entry, so a registry written against the old shape syncs without being
 * migrated by hand first.
 */
export function productIdsOf(def) {
  const ids = { ...(def.productIdByLanguage ?? {}) };
  const legacyLang = def.language || FALLBACK_LANGUAGE;
  if (def.productId && !ids[legacyLang]) ids[legacyLang] = String(def.productId);
  return ids;
}

/** The languages one offering is sold in — declared, not necessarily created. */
export function languagesOf(def) {
  const languages = Object.keys(productIdsOf(def));
  return languages.length > 0 ? languages : [FALLBACK_LANGUAGE];
}

/**
 * The registry flattened to ONE ENTRY PER DIGISTORE24 PRODUCT — which is one
 * per offering and language, not one per offering.
 *
 * Every command that talks to Digistore24 about products works on this list,
 * because that is what actually exists over there: `sync-products` creates one
 * product per row, and `request-approval` submits each row to the marketplace
 * its own language belongs to.
 *
 * `label` is what the terminal prints. It stays the bare key while an offering
 * has one language, so a single-language app's output is unchanged, and only
 * grows the ` (en)` suffix where there is genuinely more than one thing to
 * tell apart.
 */
export function productTargets(products) {
  const targets = [];
  for (const [key, def] of Object.entries(products)) {
    const ids = productIdsOf(def);
    const languages = languagesOf(def);
    for (const language of languages) {
      targets.push({
        key,
        def,
        language,
        productId: ids[language] ? String(ids[language]) : null,
        label: languages.length > 1 ? `${key} (${language})` : key,
      });
    }
  }
  return targets;
}

/**
 * Records a created/found product id back into the registry object, always in
 * the current shape.
 *
 * It also RETIRES the legacy pair for that entry once the map covers it —
 * leaving both behind is how a registry ends up with two answers to "which
 * product is the German one", and the readers would then have to pick a winner
 * for ever.
 */
export function setProductId(config, key, language, id) {
  const def = config.products[key];
  def.productIdByLanguage = { ...(def.productIdByLanguage ?? {}) };
  def.productIdByLanguage[language] = String(id);
  if (def.productId && def.productIdByLanguage[def.language || FALLBACK_LANGUAGE]) {
    delete def.productId;
    delete def.language;
  }
}

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
