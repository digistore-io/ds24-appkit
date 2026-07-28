#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Request the Digistore24 product approval (go-live step).
//
// Sets the approval status per product via updateProduct:
//   data[approval_status][<siteowner_id>] = <status>   (default: "pending")
//
// Background (updateProduct.expectedArgs): approval_status is "by_siteowner" —
// the approval is requested per siteowner and only takes effect for siteowners
// the seller has been accepted for. The siteowner is the Digistore24 reseller
// (marketplace). If none is given, the script derives it from the language:
// German → Germany reseller (1), otherwise USA reseller (2). See _resellers.mjs.
//
// Usage (with nothing given: reseller from the language, default German → id 1):
//   node scripts/ds24/request-approval.mjs                     # dry run (DE)
//   node scripts/ds24/request-approval.mjs --apply
//   node scripts/ds24/request-approval.mjs --lang en --apply   # → USA reseller (2)
//   node scripts/ds24/request-approval.mjs --reseller US --apply
//   node scripts/ds24/request-approval.mjs --siteowner <id> --apply  # any marketplace
//   [--key pro] [--status <value>]   default status: pending (e.g. --status requested)
// Env: DIGISTORE_API_KEY (writable), optionally APP_LANG,
//      DIGISTORE_SITEOWNER_ID.
import { approvalStatusOf, dropApprovalCache } from "./_approval.mjs";
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { extractProducts, idOf, readProducts } from "./_products.mjs";
import { resolveReseller } from "./_resellers.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const onlyKey = args.key ? String(args.key) : null;
const status = args.status ? String(args.status) : "pending";
const lang = args.lang ? String(args.lang) : process.env.APP_LANG || "de";

let resolved;
try {
  resolved = resolveReseller({
    siteowner: args.siteowner ?? process.env.DIGISTORE_SITEOWNER_ID,
    reseller: args.reseller,
    lang,
  });
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(2);
}

const siteowner = resolved.id;
const sourceNote = {
  siteowner: "given explicitly",
  reseller: "via --reseller",
  lang: `from language "${lang}"`,
}[resolved.source];
const resellerLabel = resolved.reseller
  ? `${resolved.reseller.name} [id=${siteowner}]`
  : `siteowner ID ${siteowner}`;
console.log(`Reseller/marketplace: ${resellerLabel} (${sourceNote})`);

const apiKey = requireApiKey();
const config = readProducts();
const entries = Object.entries(config.products).filter(
  ([key]) => !onlyKey || key === onlyKey,
);

// Read before writing: listProducts carries the current status per reseller
// (approval_status_list — probed, not documented; see _approval.mjs). So the
// dry run doubles as the status view, and --apply can refuse what would be a
// step backwards. If the list cannot be read, the request still works — the
// status column is a courtesy, not a precondition.
let byId = new Map();
try {
  const list = extractProducts(await ds24Call("listProducts", apiKey));
  byId = new Map(list.map((p) => [String(idOf(p)), p]));
} catch (err) {
  console.error(`WARN: could not read the current approval status (${err.message}).`);
}

let synced = false;
let applied = false;
for (const [key, def] of entries) {
  if (!def.productId) {
    console.log(`· skipped: "${key}" (no productId yet — run sync-products first).`);
    continue;
  }
  synced = true;
  const current = approvalStatusOf(byId.get(String(def.productId)) ?? null, siteowner);
  const currentNote = current ? ` — currently "${current}"` : "";

  // Already approved is the end state, not a thing to re-request: the reseller
  // side acts on "pending" products only, and whether writing "pending" over
  // an approval resets it is undocumented. Not worth finding out on a live
  // account.
  if (current === "approved") {
    console.log(`✓ "${key}" (product_id=${def.productId}) is already approved — skipped.`);
    continue;
  }

  if (!apply) {
    console.log(
      `DRY-RUN — would request approval "${status}": "${key}" (product_id=${def.productId}, siteowner=${siteowner}${currentNote})`,
    );
    continue;
  }
  await ds24Call("updateProduct", apiKey, {
    product_id: String(def.productId),
    [`data[approval_status][${siteowner}]`]: status,
  });
  applied = true;
  console.log(`✓ Approval "${status}" requested: "${key}" (product_id=${def.productId}${currentNote})`);
}

if (!synced) {
  console.error("No synchronized products found. Run 'sync-products.mjs --apply' first.");
  process.exit(1);
}
// Yesterday's cached answer is wrong the moment a request went out — drop it,
// or the session greeting reports the old state for up to a day.
if (applied) dropApprovalCache();
if (!apply) console.log("\nTo execute, call again with --apply.");
