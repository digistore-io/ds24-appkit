#!/usr/bin/env node
// Idempotent Digistore24 product creation.
//
// Creates one base product per plan. Name/description serve as placeholders —
// the real price is NOT set on the product, but at runtime via
// createBuyUrl (payment_plan[...] + placeholders[TITLE]/[DESCRIPTION]).
//
// Parameters as per the real DS24 API (createProduct.expectedArgs, data[...]):
//   data[name], data[name_intern], data[description], data[currency]
//   (data[amount] is deprecated → no price on the product.) Returns: product_id.
//
// Idempotency: load the product list and match by name/name_intern → no dupes.
//
// Usage:
//   node scripts/ds24/create-product.mjs --saas "Paid Challenge" --plan "Gold" \
//        --description "Access to the Gold challenge" [--currency EUR]
//   # or directly:  --name "Paid Challenge - Gold"
//   Dry run is the default. To execute: --apply
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);

const name =
  args.name ||
  (args.saas && args.plan ? `${args.saas} - ${args.plan}` : null);
if (!name) {
  console.error(
    'ERROR: --name "..." or --saas "..." --plan "..." required.',
  );
  process.exit(2);
}
const description = args.description || `${name} ({DESCRIPTION})`;
const currency = args.currency || "EUR";

// ── FIELD-MAPPING (createProduct.expectedArgs — verified) ───────────────────
function createProductParams() {
  return {
    "data[name]": name,
    "data[name_intern]": name, // internal, unique name
    "data[description]": description,
    "data[currency]": currency,
  };
}
// listProducts (readonly) — the response shape differs slightly per version.
function extractProducts(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.products)) return data.products;
  return [];
}
function matchesName(p) {
  return (
    p.name === name ||
    p.name_intern === name ||
    p.product_name === name
  );
}
function productId(p) {
  return p.product_id ?? p.id ?? null;
}
// ────────────────────────────────────────────────────────────────────────────

const apiKey = requireApiKey();

const list = await ds24Call("listProducts", apiKey).catch((e) => {
  console.error("Could not load the product list:", e.message);
  process.exit(1);
});
const existing = extractProducts(list).find(matchesName);
const doUpdate = Boolean(args.update);

if (existing) {
  const pid = productId(existing);
  if (!doUpdate) {
    console.log(
      `✓ Product already exists: "${name}" (product_id=${pid}) — nothing to do. (--update to update it)`,
    );
    process.exit(0);
  }
  // updateProduct: product_id + data[...] (same keys as createProduct).
  const updateParams = { product_id: String(pid), ...createProductParams() };
  if (!apply) {
    console.log(`DRY-RUN — product (product_id=${pid}) would be updated:`);
    console.log(JSON.stringify(updateParams, null, 2));
    console.log("\nTo execute, call again with --apply.");
    process.exit(0);
  }
  await ds24Call("updateProduct", apiKey, updateParams);
  console.log(`✓ Product updated: "${name}" (product_id=${pid})`);
  process.exit(0);
}

if (!apply) {
  console.log("DRY-RUN — the following product would be created:");
  console.log(JSON.stringify(createProductParams(), null, 2));
  console.log("\nTo execute, call again with --apply.");
  process.exit(0);
}

const created = await ds24Call("createProduct", apiKey, createProductParams());
console.log(`✓ Product created: "${name}" (product_id=${productId(created) ?? "?"})`);
console.log(
  "Tip: store the product_id as DIGISTORE_PRODUCT_ID_<PLAN> in .env;",
);
console.log("the price is set per offer via createBuyUrl.");
