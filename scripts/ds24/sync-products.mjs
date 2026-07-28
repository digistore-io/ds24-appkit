#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Synchronize the Digistore24 products from the registry (idempotent).
//
// Reads config/digistore-products.json, creates each product via createProduct
// or updates it via updateProduct, and writes the resulting id back into the
// config. That way the config is the source of truth and the checkout
// (product link …/product/<id>) has stable IDs.
//
// ONE PRODUCT PER OFFERING **AND LANGUAGE**, not one per offering. A
// Digistore24 product carries exactly one `data[language]`, and that language
// is the language of the ORDER FORM the buyer fills in — createBuyUrl has no
// parameter to override it. So an app selling in German and English needs two
// products per plan, and this script creates one for every language named in
// `productIdByLanguage`. The full reasoning is in lib/digistore/products.ts.
//
// IMPORTANT — why no price is set here:
// The DS24 API explicitly rejects `data[amount]` ("is deprecated - create a
// payment plan instead"), and there is NO API endpoint for creating payment
// plans. This template therefore takes the other route: price and interval are
// passed from the registry to createBuyUrl as `payment_plan[...]` at checkout
// time (lib/digistore/buyUrl.ts). So you do NOT have to maintain any payment
// plans in the DS24 UI — priceCents/billingInterval in the registry are enough.
//
// This script manages the product master data: name, internal name,
// description, product image, thank-you URL, quantities — and the productId.
//
// Matching/idempotency: 1) the id already in the config, otherwise
// 2) name_intern/name in listProducts → no duplicates. `name_intern` is the
// stable registry key plus the language, so that a changed display name does
// not break finding the product again.
//
// Usage:
//   node scripts/ds24/sync-products.mjs                 # dry run (all)
//   node scripts/ds24/sync-products.mjs --apply         # create/update
//   node scripts/ds24/sync-products.mjs --key pro --apply
//   node scripts/ds24/sync-products.mjs --dry-run       # never writes, beats --apply
//   [--thankyou "https://app.example.de/optin/[ORDER_ID]"]  # otherwise from APP_URL
// Env: DIGISTORE_API_KEY (writable), optionally APP_URL.
//
// `node run.mjs ds24-sync` adds --apply by itself — the preview there is
// `node run.mjs ds24-sync --dry-run`.
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import {
  readProducts,
  writeProducts,
  extractProducts,
  idOf,
  contradictingProducts,
  appLanguages,
  languagesOf,
  FALLBACK_LANGUAGE,
  productTargets,
  setProductId,
} from "./_products.mjs";
import { isKnownLanguage } from "./_resellers.mjs";
import { publicUrlFor } from "./_public-url.mjs";
import { DIGISTORE_REDIR_URL } from "../../lib/digistore/config.mjs";

const args = parseArgs(process.argv.slice(2));
// --dry-run wins over --apply: run.mjs hands --apply in by default, and
// asking for a preview has to be able to override that.
const apply = Boolean(args.apply) && !args["dry-run"];
const onlyKey = args.key ? String(args.key) : null;

// The thank-you page. Digistore24 stores public https URLs only, so a local app
// travels as a redirect address (scripts/ds24/_public-url.mjs) — without it the
// whole sync fails on "Please only use secure URLs with https://".
const appUrl = publicUrlFor(
  args.thankyou
    ? String(args.thankyou)
    : process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, "")}/optin/[ORDER_ID]`
      : null,
);

/**
 * The internal name of ONE language product — the stable handle this script
 * finds it by again, so a changed display name never orphans it.
 *
 * It carries the language because `name_intern` has to be unique per product
 * and there is now one product per key AND language. Deliberately a pure
 * function of the two, and NOT "bare key for a single language": that variant
 * would rename a live product the day its offering gains a second language,
 * and would make the name depend on how the registry happens to be ordered.
 * The pre-0.6.0 bare key is handled where it belongs — as a lookup fallback in
 * findExisting, never as something written.
 */
function internalName(key, language) {
  return `${key}__${language}`;
}

// data[...] for create/update from a registry definition (without a price).
function productData(key, def, language) {
  const data = {
    "data[name]": def.name,
    // Stable internal name = registry key (+ language, see internalName). The
    // display name may therefore change at any time without breaking the
    // ability to find the product.
    "data[name_intern]": internalName(key, language),
    "data[description]": def.description || def.name,
    "data[currency]": def.currency || "EUR",
    // THE FIELD THIS WHOLE PER-LANGUAGE LOOP EXISTS FOR. It is the language of
    // the ORDER FORM — labels, buttons, payment methods, cancellation terms —
    // and it is the only place that language can be set: createBuyUrl has no
    // parameter for it. Left unset, Digistore24 falls back to the language of
    // the API session, which is nobody's deliberate choice and was how a
    // German app came to show English forms (and the reverse).
    "data[language]": language,
  };
  if (appUrl) data["data[thankyou_url]"] = appUrl;
  // Product image: a publicly reachable URL, otherwise DS24 rejects it.
  if (def.imageUrl) data["data[image_url]"] = def.imageUrl;
  // Token packages are quantity products: exactly 1 package per purchase,
  // otherwise the credits no longer match the purchase.
  if (def.kind === "token") {
    data["data[default_quantity]"] = "1";
    data["data[max_quantity]"] = "1";
  }
  return data;
}

// The languages the app itself speaks. Resolved once — every entry is checked
// against the same list.
const speaks = appLanguages();

// Warns about registry entries that would only show up later, at checkout.
function checkDefinition(key, def) {
  const warn = [];
  if (def.priceCents == null)
    warn.push("no priceCents — the checkout cannot set a price");
  if (def.kind === "subscription" && !def.billingInterval)
    warn.push("kind=subscription without billingInterval (e.g. 1_month)");
  if (def.kind === "token" && !def.credits)
    warn.push("kind=token without credits — no balance would be credited");
  if (def.imageUrl && !/^https:\/\//.test(def.imageUrl))
    warn.push("imageUrl is not an https URL — DS24 rejects it");

  // The language gap. It costs no sale — a visitor with no product in their
  // language is sent to another one (lib/digistore/products.ts →
  // checkoutProductFor) — but they fill in an order form in a language they
  // did not choose, at the moment they are asked for their card. Nothing else
  // ever reports it: the app renders fine, the checkout opens, the purchase
  // completes. So it is said here, where the fix is one line away.
  const languages = languagesOf(def);
  const missing = speaks.filter((lang) => !languages.includes(lang));
  if (missing.length > 0) {
    warn.push(
      `no Digistore24 product for ${missing.join(", ")} — the app speaks ` +
        `${speaks.join(", ")}, so those buyers get an order form in ` +
        `"${languages[0]}". Add them to "productIdByLanguage" (value null) and sync again`,
    );
  }
  for (const lang of languages) {
    if (!isKnownLanguage(lang))
      warn.push(`"${lang}" is not a Digistore24 language code (de, en, fr, es, nl, it, pt, pl, sl)`);
  }

  for (const w of warn) console.warn(`  ! ${key}: ${w}`);
  return warn.length;
}

// Say it out loud — otherwise the address at Digistore24 looks wrong to anyone
// who checks it in the UI.
if (appUrl && appUrl.startsWith(DIGISTORE_REDIR_URL)) {
  console.log(`• Thank-you page runs through the redirect: ${appUrl}`);
  console.log("  Digistore24 stores no localhost URL; the redirect leads back to your app.");
}

// The config is read and checked BEFORE the API key is demanded: a
// contradiction in the registry is a mistake in a file that is right here, and
// answering "no API key" to somebody whose actual problem is a product they
// have to delete sends them off to fix the wrong thing.
const config = readProducts();

// Before anything is created: does the registry contradict what this app says
// it sells? A token package in a "subscriptions" app would be published here
// and buyable at Digistore24, while the app renders nothing that credits the
// buyer. Refused rather than warned — a dry run does not show it either,
// because the mismatch is not in the diff, it is in the app.
const contradicting = contradictingProducts(config);
if (contradicting.length > 0) {
  console.error(
    `"billingMode": "${config.billingMode}" in config/digistore-products.json does not match these products:\n` +
      contradicting.map((key) => `  - ${key}`).join("\n") +
      `\n\nEither set "billingMode" to "both", or delete those products from the config.` +
      `\n(If one of them already exists at Digistore24, deactivate it THERE — removing it here does not unpublish it.)`,
  );
  process.exit(2);
}

const apiKey = requireApiKey();
// ONE ROW PER DIGISTORE24 PRODUCT — per offering AND language. That is what
// exists over there, and it is what this loop creates.
const targets = productTargets(config.products).filter(
  ({ key }) => !onlyKey || key === onlyKey,
);
if (targets.length === 0) {
  console.error(onlyKey ? `No product "${onlyKey}" in the config.` : "No products in the config.");
  process.exit(2);
}

// Load the product list once (for matching by name).
const list = extractProducts(
  await ds24Call("listProducts", apiKey).catch((e) => {
    console.error("Could not load the product list:", e.message);
    process.exit(1);
  }),
);
/**
 * Find a product this script (or a hand) created earlier: first via the stable
 * internal name, then via the display name — the latter catches products that
 * were already created by hand in DS24 before this convention existed.
 *
 * `claimed` is what keeps the language split honest. The display name is the
 * SAME for every language of one offering (product copy is deliberately not
 * translated), so without it the English row would happily match the German
 * product and both languages would end up pointing at one id — silently
 * undoing the whole point of the split. A product already taken by an earlier
 * row of this run is therefore skipped, and the second language gets created.
 *
 * The bare-key lookup is the same guard from the other side: it is the
 * pre-0.6.0 internal name, so it may only answer for the FIRST language, which
 * is the one that product was created as.
 */
function findExisting({ key, def, language }, claimed) {
  const free = (p) => (p && !claimed.has(String(idOf(p))) ? p : null);
  const byInternal = list.find((p) => p.name_intern === internalName(key, language));
  if (byInternal) return free(byInternal);

  // Everything below is the pre-0.6.0 world, where an offering had ONE product
  // whose internal name was the bare key. Such a product is in exactly one
  // language — the one the old registry named in `language` — so only that row
  // may claim it. Anchoring on the legacy field rather than on "the first
  // language in the map" is what makes this independent of how the JSON
  // happens to be ordered: reorder `{en, de}` to `{de, en}` and an
  // order-based rule would hand the German product to the English row.
  const legacyLanguage = def.language || FALLBACK_LANGUAGE;
  if (language !== legacyLanguage) return null;

  const byLegacyKey = list.find((p) => p.name_intern === key);
  if (byLegacyKey) return free(byLegacyKey);
  const byName = list.find(
    (p) => p.name === def.name || p.name_intern === def.name || p.product_name === def.name,
  );
  return free(byName);
}

let changed = false;
let warnings = 0;
const seenKeys = new Set();
// Ids already used by an earlier row of this run — see findExisting.
const claimed = new Set();
for (const target of targets) {
  const { key, def, language, label } = target;
  // Once per offering, not once per language: the price, the interval and the
  // credits are shared, and saying it twice reads as two separate problems.
  if (!seenKeys.has(key)) {
    warnings += checkDefinition(key, def);
    seenKeys.add(key);
  }

  const data = productData(key, def, language);
  const existingId = target.productId || idOf(findExisting(target, claimed) || {});

  if (existingId) {
    claimed.add(String(existingId));
    if (!apply) {
      console.log(`DRY-RUN — would update: "${label}" (product_id=${existingId}, language=${language})`);
    } else {
      await ds24Call("updateProduct", apiKey, { product_id: String(existingId), ...data });
      console.log(`✓ updated: "${label}" (product_id=${existingId}, language=${language})`);
    }
    if (target.productId !== String(existingId)) {
      setProductId(config, key, language, existingId);
      changed = true;
    }
    continue;
  }

  if (!apply) {
    console.log(`DRY-RUN — would create: "${label}" (${def.name}, language=${language})`);
    continue;
  }
  const created = await ds24Call("createProduct", apiKey, data);
  const newId = idOf(created);
  if (!newId) {
    console.error(`✗ createProduct returned no product_id for "${label}".`);
    process.exit(1);
  }
  claimed.add(String(newId));
  setProductId(config, key, language, newId);
  changed = true;
  console.log(`✓ created: "${label}" (product_id=${newId}, language=${language})`);
}

if (apply && changed) {
  writeProducts(config);
  console.log("→ product id(s) written to config/digistore-products.json (productIdByLanguage).");
} else if (!apply) {
  console.log("\nNothing was changed. To execute: node run.mjs ds24-sync");
}

if (warnings > 0) {
  console.log(
    `\nCheck the ${warnings} note(s) above — otherwise they only surface at checkout.`,
  );
}

console.log(
  "\nPrices come from the registry (priceCents/billingInterval) and are passed as\n" +
    "payment_plan at checkout. NO payment plans are needed in DS24.",
);
