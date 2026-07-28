#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Show and request the Digistore24 product approval (go-live step).
//
// Without --apply this is the STATUS VIEW: it reads the current approval per
// product from listProducts (approval_status_list) and prints it. With --apply
// it sets the status per product via updateProduct:
//   data[approval_status][<siteowner_id>] = <status>   (default: "pending")
//
// Background (updateProduct.expectedArgs): approval_status is "by_siteowner" —
// the approval is requested per siteowner and only takes effect for siteowners
// the seller has been accepted for. The siteowner is the Digistore24 reseller
// (marketplace).
//
// **Which marketplace a product goes to follows the PRODUCT's language**, not
// the app's: a German product is submitted to Digistore24 Germany (id 1), an
// English one to Digistore24 USA (id 2). The language is `language` on the
// product in config/digistore-products.json; a product that does not name one
// falls back to APP_LANG and then to German. So one app can sell a German and
// an English product and each is submitted where it belongs. See _resellers.mjs.
//
// --lang / --reseller / --siteowner override that for EVERY product in the run.
//
// Usage:
//   node scripts/ds24/request-approval.mjs                     # status view (dry run)
//   node scripts/ds24/request-approval.mjs --apply             # request, per product language
//   node scripts/ds24/request-approval.mjs --lang en --apply   # force USA reseller (2)
//   node scripts/ds24/request-approval.mjs --reseller US --apply
//   node scripts/ds24/request-approval.mjs --siteowner <id> --apply  # any marketplace
//   [--key pro] [--status <new|pending|approved|rejected>] [--force]
// Env: DIGISTORE_API_KEY (writable), optionally APP_LANG,
//      DIGISTORE_SITEOWNER_ID.
import {
  KNOWN_STATUSES,
  approvalStatusOf,
  dropApprovalCache,
  statusesFrom,
  writeApprovalCache,
} from "./_approval.mjs";
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { extractProducts, idOf, readProducts } from "./_products.mjs";
import { resolveReseller } from "./_resellers.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const force = Boolean(args.force);
const onlyKey = args.key ? String(args.key) : null;
const status = args.status ? String(args.status) : "pending";
const appLang = process.env.APP_LANG || "de";

// The reader knows exactly four values (_approval.mjs → KNOWN_STATUSES). A
// free-text status would be written to Digistore24 and then normalize to
// "unreadable" on the way back, so the product would vanish from the greeting,
// from doctor and from this very view — permanently, and without a word.
if (!KNOWN_STATUSES.includes(status)) {
  console.error(
    `ERROR: unknown --status "${status}". Known: ${KNOWN_STATUSES.join(", ")}.\n` +
      `       (Only "pending" is worth setting by hand — the reseller sets the rest.)`,
  );
  process.exit(2);
}

// An explicit flag applies to the whole run; without one, each product is
// resolved from its own language further down.
let forced = null;
if (args.siteowner ?? args.reseller ?? args.lang ?? process.env.DIGISTORE_SITEOWNER_ID) {
  try {
    forced = resolveReseller({
      siteowner: args.siteowner ?? process.env.DIGISTORE_SITEOWNER_ID,
      reseller: args.reseller,
      lang: args.lang ?? appLang,
    });
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
  const label = forced.reseller ? `${forced.reseller.name} [id=${forced.id}]` : `siteowner ID ${forced.id}`;
  const why = { siteowner: "given explicitly", reseller: "via --reseller", lang: "via --lang" }[forced.source];
  console.log(`Marketplace for every product: ${label} (${why})`);
} else {
  console.log(`Marketplace: per product, from its language (fallback APP_LANG="${appLang}")`);
}

const apiKey = requireApiKey();
const config = readProducts();
const entries = Object.entries(config.products).filter(
  ([key]) => !onlyKey || key === onlyKey,
);

// Read before writing. listProducts carries the current status per reseller
// (approval_status_list — probed, not documented; see _approval.mjs). The dry
// run is that view, and --apply needs it to refuse a step backwards.
let statusRead = false;
let list = [];
try {
  list = extractProducts(await ds24Call("listProducts", apiKey));
  statusRead = true;
} catch (err) {
  console.error(`WARN: could not read the current approval status (${err.message}).`);
}
const byId = new Map(list.filter((p) => p && typeof p === "object").map((p) => [String(idOf(p)), p]));

// Writing blind is the one thing this script must not do. `updateProduct` with
// approval_status=pending on a product the reseller has already APPROVED is a
// step whose effect Digistore24 does not document, and the guard against it is
// the status we just failed to read. The sibling script refuses on the same
// failure (sync-products.mjs), and so does this one.
if (apply && !statusRead && !force) {
  console.error(
    "ERROR: refusing to request approval without knowing the current status —\n" +
      "       a product that is already approved must not be set back to pending.\n" +
      "       Try again, or pass --force to request anyway.",
  );
  process.exit(1);
}

let synced = false;
let applied = false;
let refused = 0;

try {
  for (const [key, def] of entries) {
    if (!def.productId) {
      console.log(`· skipped: "${key}" (no productId yet — run sync-products first).`);
      continue;
    }
    synced = true;

    // Per product, unless a flag forced one marketplace for the whole run.
    const target = forced ?? resolveReseller({ lang: def.language || appLang });
    const siteowner = target.id;
    const where = target.reseller ? target.reseller.name : `siteowner ${siteowner}`;

    const current = approvalStatusOf(byId.get(String(def.productId)) ?? null, siteowner);
    const known = current !== null;
    const currentNote = known ? `currently "${current}"` : "status unknown";

    // Already approved for THIS marketplace is the end state. Deliberately not
    // the aggregated status: a product approved in Germany may still have a
    // legitimate request to make in the USA.
    if (current === "approved") {
      console.log(`✓ "${key}" (product_id=${def.productId}) is already approved at ${where} — skipped.`);
      continue;
    }

    if (!apply) {
      console.log(
        `DRY-RUN — would request "${status}": "${key}" (product_id=${def.productId}) ` +
          `at ${where} [id=${siteowner}] — ${currentNote}`,
      );
      continue;
    }

    if (!known && !force) {
      console.error(
        `· REFUSED: "${key}" (product_id=${def.productId}) — its status at ${where} could not be ` +
          `read, so an existing approval cannot be ruled out. Pass --force to request anyway.`,
      );
      refused++;
      continue;
    }

    await ds24Call("updateProduct", apiKey, {
      product_id: String(def.productId),
      [`data[approval_status][${siteowner}]`]: status,
    });
    applied = true;
    console.log(`✓ Approval "${status}" requested: "${key}" at ${where} [id=${siteowner}] (was ${currentNote})`);
  }
} finally {
  // In a `finally` because a throw halfway through the loop still leaves the
  // requests that already went out — and a cache describing the state before
  // them, which the greeting would then report for the rest of the day.
  if (applied) {
    dropApprovalCache();
  } else if (statusRead && !onlyKey) {
    // Nothing was written, but we just read the live truth. Handing it to the
    // cache is what stops the greeting saying "pending" for the rest of the day
    // about products the reseller approved an hour ago.
    const synced_entries = entries.filter(([, def]) => def.productId);
    if (synced_entries.length > 0) {
      writeApprovalCache({ checkedAt: Date.now(), statuses: statusesFrom(synced_entries, list) });
    }
  }
}

if (!synced) {
  console.error("No synchronized products found. Run 'sync-products.mjs --apply' first.");
  process.exit(1);
}
if (!apply) console.log("\nTo execute, call again with --apply.");
if (refused > 0) process.exit(1);
