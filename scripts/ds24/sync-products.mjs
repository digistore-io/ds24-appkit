#!/usr/bin/env node
// Synchronize the Digistore24 products from the registry (idempotent).
//
// Reads config/digistore-products.json, creates each product via createProduct
// or updates it via updateProduct, and writes the resulting `productId` back
// into the config. That way the config is the source of truth and the checkout
// (product link …/product/<id>) has stable IDs.
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
// Matching/idempotency: 1) existing productId from the config, otherwise
// 2) name_intern/name in listProducts → no duplicates. `name_intern` is the
// stable registry key, so that a changed display name does not break finding
// the product again.
//
// Usage:
//   node scripts/ds24/sync-products.mjs                 # dry run (all)
//   node scripts/ds24/sync-products.mjs --apply         # create/update
//   node scripts/ds24/sync-products.mjs --key pro --apply
//   node scripts/ds24/sync-products.mjs --dry-run       # never writes, beats --apply
//   [--thankyou "https://app.example.de/optin/[ORDER_ID]"]  # otherwise from APP_URL
// Env: DIGISTORE_API_KEY (writable), optionally DIGISTORE_URL, APP_URL.
//
// `node run.mjs ds24-sync` adds --apply by itself — the preview there is
// `node run.mjs ds24-sync --dry-run`.
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { readProducts, writeProducts, extractProducts, idOf } from "./_products.mjs";
import { publicUrlFor, redirUrl } from "./_public-url.mjs";

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

// data[...] for create/update from a registry definition (without a price).
function productData(key, def) {
  const data = {
    "data[name]": def.name,
    // Stable internal name = registry key. The display name may therefore
    // change at any time without breaking the ability to find the product.
    "data[name_intern]": key,
    "data[description]": def.description || def.name,
    "data[currency]": def.currency || "EUR",
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
  for (const w of warn) console.warn(`  ! ${key}: ${w}`);
  return warn.length;
}

// Say it out loud — otherwise the address at Digistore24 looks wrong to anyone
// who checks it in the UI.
if (appUrl && appUrl.startsWith(redirUrl())) {
  console.log(`• Thank-you page runs through the redirect: ${appUrl}`);
  console.log("  Digistore24 stores no localhost URL; the redirect leads back to your app.");
}

const apiKey = requireApiKey();
const config = readProducts();
const entries = Object.entries(config.products).filter(
  ([key]) => !onlyKey || key === onlyKey,
);
if (entries.length === 0) {
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
// Matching: first via the stable registry key (name_intern), then via the
// display name — the latter catches products that were already created by hand
// in DS24 before this convention existed.
function findExisting(key, name) {
  return (
    list.find((p) => p.name_intern === key) ||
    list.find(
      (p) => p.name === name || p.name_intern === name || p.product_name === name,
    )
  );
}

let changed = false;
let warnings = 0;
for (const [key, def] of entries) {
  warnings += checkDefinition(key, def);
  const data = productData(key, def);
  const existingId = def.productId || idOf(findExisting(key, def.name) || {});

  if (existingId) {
    if (!apply) {
      console.log(`DRY-RUN — would update: "${key}" (product_id=${existingId})`);
    } else {
      await ds24Call("updateProduct", apiKey, { product_id: String(existingId), ...data });
      console.log(`✓ updated: "${key}" (product_id=${existingId})`);
    }
    if (def.productId !== String(existingId)) {
      config.products[key].productId = String(existingId);
      changed = true;
    }
    continue;
  }

  if (!apply) {
    console.log(`DRY-RUN — would create: "${key}" (${def.name})`);
    continue;
  }
  const created = await ds24Call("createProduct", apiKey, data);
  const newId = idOf(created);
  if (!newId) {
    console.error(`✗ createProduct returned no product_id for "${key}".`);
    process.exit(1);
  }
  config.products[key].productId = String(newId);
  changed = true;
  console.log(`✓ created: "${key}" (product_id=${newId})`);
}

if (apply && changed) {
  writeProducts(config);
  console.log("→ productId(s) written to config/digistore-products.json.");
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
