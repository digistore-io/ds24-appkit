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
// ONE PRODUCT SET **PER ENVIRONMENT** (dev / staging / prod, see _env.mjs and
// docs/environments.md). `--env prod` syncs the live set against the deployed
// domain (APP_URL_PROD), `--env dev` — the default on a local machine — the
// development set against APP_URL. Each set has its own ids in the registry
// (`productIds.<env>`), its own internal names (`key__lang__env`) and, for
// dev/staging, a visible name suffix (" [DEV]"), so the sets never claim each
// other's products. Staging is optional — most apps go dev → prod, which is
// fine as long as they test.
//
// ONE PRODUCT PER OFFERING **AND LANGUAGE**, not one per offering. A
// Digistore24 product carries exactly one `data[language]`, and that language
// is the language of the ORDER FORM the buyer fills in — createBuyUrl has no
// parameter to override it. So an app selling in German and English needs two
// products per plan, and this script creates one for every language declared
// in `productIds`. The full reasoning is in lib/digistore/products.ts.
//
// ONE PRODUCT GROUP PER APPLICATION (all environments together): the DS24 API
// has no tag field, so the group (a folder in the vendor backend) is what
// keeps this app's products findable next to everything else the account
// sells. Its id is persisted in the registry (`productGroupId`) like the
// product ids, and every create/update sends it — so a group deleted at DS24
// is recreated and re-collects the products on the next sync by itself.
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
// stable registry key plus the language plus the environment, so that a
// changed display name does not break finding the product again — and a dev
// sync cannot claim a prod product (findExisting).
//
// Usage:
//   node scripts/ds24/sync-products.mjs                 # dry run (all, env from APP_ENV)
//   node scripts/ds24/sync-products.mjs --apply         # create/update
//   node scripts/ds24/sync-products.mjs --env prod --apply   # the LIVE set (needs APP_URL_PROD)
//   node scripts/ds24/sync-products.mjs --key pro --apply
//   node scripts/ds24/sync-products.mjs --dry-run       # never writes, beats --apply
//   [--thankyou "https://app.example.de/optin/[ORDER_ID]"]  # otherwise from the env's app URL
// Env: DIGISTORE_API_KEY (writable); APP_URL (dev), APP_URL_PROD / APP_URL_STAGING
// for a locally-run prod/staging sync.
//
// `node run.mjs ds24-sync` adds --apply by itself — the preview there is
// `node run.mjs ds24-sync --dry-run`.
import { readFileSync } from "node:fs";
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import {
  readProducts,
  writeProducts,
  extractProducts,
  idOf,
  contradictingProducts,
  adoptLegacyAsProd,
  appLanguages,
  languagesOf,
  FALLBACK_LANGUAGE,
  productTargets,
  setProductId,
} from "./_products.mjs";
import {
  resolveSyncEnv,
  internalName,
  displayName,
  appUrlForEnv,
  overlongKeys,
  NAME_INTERN_MAX,
} from "./_env.mjs";
import { isKnownLanguage } from "./_resellers.mjs";
import { publicUrlFor } from "./_public-url.mjs";
import { DIGISTORE_REDIR_URL } from "../../lib/digistore/config.mjs";

const args = parseArgs(process.argv.slice(2));
// --dry-run wins over --apply: run.mjs hands --apply in by default, and
// asking for a preview has to be able to override that.
const apply = Boolean(args.apply) && !args["dry-run"];
const onlyKey = args.key ? String(args.key) : null;

// Which environment's product set this run maintains: --env, else APP_ENV —
// so a sync run on the deployed host targets prod with no flag at all.
const resolvedEnv = resolveSyncEnv(args);
if (resolvedEnv.error) {
  console.error(`ERROR: ${resolvedEnv.error}`);
  process.exit(2);
}
const env = resolvedEnv.env;
console.log(
  `• Environment: ${env.toUpperCase()}` +
    (env === "prod"
      ? " — the LIVE product set (ids → productIds.prod)"
      : ` — product names carry the [${env.toUpperCase()}] suffix (ids → productIds.${env})`),
);

// The thank-you page. Digistore24 stores public https URLs only, so a local app
// travels as a redirect address (scripts/ds24/_public-url.mjs) — without it the
// whole sync fails on "Please only use secure URLs with https://".
// For staging/prod the URL comes from APP_URL_STAGING / APP_URL_PROD, and a
// missing one is a refusal: prod products pointing at localhost help nobody.
let thankyouTarget = args.thankyou ? String(args.thankyou) : null;
if (!thankyouTarget) {
  const resolved = appUrlForEnv(env);
  if (resolved.error) {
    console.error(`ERROR: ${resolved.error}`);
    process.exit(2);
  }
  if (resolved.url) thankyouTarget = `${resolved.url}/optin/[ORDER_ID]`;
}
const appUrl = publicUrlFor(thankyouTarget);

// data[...] for create/update from a registry definition (without a price).
function productData(key, def, language) {
  const data = {
    // Buyers see the environment: dev/staging names carry a suffix, prod
    // stays clean (_env.mjs → displayName).
    "data[name]": displayName(def.name, env),
    // Stable internal name = registry key + language + environment (see
    // _env.mjs → internalName). The display name may therefore change at any
    // time without breaking the ability to find the product.
    "data[name_intern]": internalName(key, language, env),
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
  // The app's own product group — sent on create AND update, so a product
  // that predates the group (or a group recreated after deletion) is pulled
  // in on its next sync without anybody doing anything.
  if (groupId) data["data[product_group_id]"] = String(groupId);
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
        `"${languages[0]}". Add them to "productIds" (value null) and sync again`,
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
let changed = false;

// A prod sync adopts the pre-environment fields as the prod set first: those
// products may carry real sales and approvals and must be updated, never
// recreated (see adoptLegacyAsProd in _products.mjs).
if (env === "prod" && adoptLegacyAsProd(config)) {
  changed = true;
  console.log("• Adopted the pre-environment product ids as the PROD set (productIds.prod).");
}

// Refuse keys whose internal name would not fit before anything is created —
// half a synced registry is worse than a named refusal.
const allLanguages = [
  ...new Set(Object.values(config.products).flatMap((def) => languagesOf(def))),
];
const tooLong = overlongKeys(Object.keys(config.products), allLanguages);
if (tooLong.length > 0) {
  console.error(
    `These product keys are too long for Digistore24's ${NAME_INTERN_MAX}-character ` +
      `internal name (key__language__environment):\n` +
      tooLong.map((key) => `  - ${key}`).join("\n") +
      `\nShorten them in config/digistore-products.json (before the first live sale).`,
  );
  process.exit(2);
}

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
const targets = productTargets(config.products, env).filter(
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

// --- The product group: ONE per application, every environment together. ----
// Identified by the stored id first (the registry is the source of truth,
// like the product ids), by name second (recovers a lost id), created last.
// The name is the app's own (APP_NAME / package.json), capped at the API's 31
// characters.
function packageName() {
  try {
    return JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ).name;
  } catch {
    return null;
  }
}
const groupName = String(process.env.APP_NAME || packageName() || "app").slice(0, 31);

function extractGroups(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.product_groups)) return data.product_groups;
  if (data && Array.isArray(data.groups)) return data.groups;
  return [];
}

async function resolveProductGroup() {
  const stored = config.productGroupId ? String(config.productGroupId) : null;
  if (stored) {
    // Verify it still exists — a group deleted in the DS24 backend must not
    // leave every product pointing at a dead folder for ever.
    const found = await ds24Call("getProductGroup", apiKey, {
      product_group_id: stored,
    }).catch(() => null);
    if (found) return stored;
    console.log(`• Product group ${stored} no longer exists at Digistore24 — recovering.`);
  }
  const groups = extractGroups(
    await ds24Call("listProductGroups", apiKey).catch(() => []),
  );
  const byName = groups.find(
    (g) => String(g?.name ?? "") === groupName && (g?.product_group_id ?? g?.id),
  );
  if (byName) return String(byName.product_group_id ?? byName.id);
  if (!apply) return null;
  const created = await ds24Call("createProductGroup", apiKey, {
    "data[name]": groupName,
  });
  const id = created?.product_group_id ?? created?.id ?? null;
  if (!id) {
    console.error("✗ createProductGroup returned no product_group_id.");
    process.exit(1);
  }
  console.log(`✓ product group created: "${groupName}" (product_group_id=${id})`);
  return String(id);
}

const groupId = await resolveProductGroup();
if (groupId && String(config.productGroupId ?? "") !== groupId) {
  config.productGroupId = groupId;
  changed = true;
}
if (!groupId && !apply) {
  console.log(
    `DRY-RUN — would create the product group "${groupName}" and put every product of this app in it.`,
  );
}

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
 *
 * EVERY fallback below the env-scoped internal name is prod-only. The
 * pre-environment products (bare `key__lang`, bare `key`, a hand-created
 * display name) are the ones that may carry real sales and approvals, and
 * prod is the set they belong to — a dev or staging row that is not found
 * under its own internal name gets CREATED, never adopted. That is the
 * guarantee that a dev sync cannot rename a live product into "[DEV]".
 */
const ENV_SCOPED_INTERN = /__(dev|staging|prod)$/;

function findExisting({ key, def, language }, claimed) {
  const free = (p) => (p && !claimed.has(String(idOf(p))) ? p : null);
  const byInternal = list.find(
    (p) => p.name_intern === internalName(key, language, env),
  );
  if (byInternal) return free(byInternal);

  if (env !== "prod") return null;

  // Another environment's product is never a legacy candidate — it already
  // belongs to a set.
  const unscoped = (p) => !ENV_SCOPED_INTERN.test(String(p.name_intern ?? ""));

  // The pre-environment internal name (template < 0.14.0): one shared product
  // per key and language.
  const byPreEnv = list.find(
    (p) => unscoped(p) && p.name_intern === `${key}__${language}`,
  );
  if (byPreEnv) return free(byPreEnv);

  // Everything below is the pre-0.6.0 world, where an offering had ONE product
  // whose internal name was the bare key. Such a product is in exactly one
  // language — the one the old registry named in `language` — so only that row
  // may claim it. Anchoring on the legacy field rather than on "the first
  // language in the map" is what makes this independent of how the JSON
  // happens to be ordered: reorder `{en, de}` to `{de, en}` and an
  // order-based rule would hand the German product to the English row.
  const legacyLanguage = def.language || FALLBACK_LANGUAGE;
  if (language !== legacyLanguage) return null;

  const byLegacyKey = list.find((p) => unscoped(p) && p.name_intern === key);
  if (byLegacyKey) return free(byLegacyKey);
  const byName = list.find(
    (p) =>
      unscoped(p) &&
      (p.name === def.name || p.name_intern === def.name || p.product_name === def.name),
  );
  return free(byName);
}

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
      setProductId(config, key, language, existingId, env);
      changed = true;
    }
    continue;
  }

  if (!apply) {
    console.log(
      `DRY-RUN — would create: "${label}" ("${displayName(def.name, env)}", language=${language})`,
    );
    continue;
  }
  const created = await ds24Call("createProduct", apiKey, data);
  const newId = idOf(created);
  if (!newId) {
    console.error(`✗ createProduct returned no product_id for "${label}".`);
    process.exit(1);
  }
  claimed.add(String(newId));
  setProductId(config, key, language, newId, env);
  changed = true;
  console.log(`✓ created: "${label}" (product_id=${newId}, language=${language})`);
}

if (apply && changed) {
  writeProducts(config);
  console.log(
    `→ written to config/digistore-products.json (productIds.${env} + productGroupId).`,
  );
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
