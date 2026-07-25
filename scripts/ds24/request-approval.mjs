#!/usr/bin/env node
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
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { readProducts } from "./_products.mjs";
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

let any = false;
for (const [key, def] of entries) {
  if (!def.productId) {
    console.log(`· skipped: "${key}" (no productId yet — run sync-products first).`);
    continue;
  }
  any = true;
  const params = {
    product_id: String(def.productId),
    [`data[approval_status][${siteowner}]`]: status,
  };
  if (!apply) {
    console.log(
      `DRY-RUN — would request approval "${status}": "${key}" (product_id=${def.productId}, siteowner=${siteowner})`,
    );
    continue;
  }
  await ds24Call("updateProduct", apiKey, params);
  console.log(`✓ Approval "${status}" requested: "${key}" (product_id=${def.productId})`);
}

if (!any) {
  console.error("No synchronized products found. Run 'sync-products.mjs --apply' first.");
  process.exit(1);
}
if (!apply) console.log("\nTo execute, call again with --apply.");
