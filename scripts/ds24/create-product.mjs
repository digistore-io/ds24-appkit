#!/usr/bin/env node
// Idempotente Digistore24-Produkt-Anlage.
//
// Erzeugt ein Basisprodukt je Tarif. Name/Beschreibung dienen als Platzhalter —
// der reale Preis wird NICHT am Produkt gesetzt, sondern zur Laufzeit über
// createBuyUrl (payment_plan[...] + placeholders[TITLE]/[DESCRIPTION]).
//
// Parameter gemäß echter DS24-API (createProduct.expectedArgs, data[...]):
//   data[name], data[name_intern], data[description], data[currency]
//   (data[amount] ist deprecated → kein Preis am Produkt.) Rückgabe: product_id.
//
// Idempotenz: Produktliste laden und per name/name_intern matchen → kein Doppel.
//
// Nutzung:
//   node scripts/ds24/create-product.mjs --saas "Paid Challenge" --tarif "Gold" \
//        --description "Zugang zur Gold-Challenge" [--currency EUR]
//   # oder direkt:  --name "Paid Challenge - Gold"
//   Dry-Run ist Standard. Zum Ausführen: --apply
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);

const name =
  args.name ||
  (args.saas && args.tarif ? `${args.saas} - ${args.tarif}` : null);
if (!name) {
  console.error(
    'FEHLER: --name "..." oder --saas "..." --tarif "..." erforderlich.',
  );
  process.exit(2);
}
const description = args.description || `${name} ({DESCRIPTION})`;
const currency = args.currency || "EUR";

// ── FIELD-MAPPING (createProduct.expectedArgs — verifiziert) ────────────────
function createProductParams() {
  return {
    "data[name]": name,
    "data[name_intern]": name, // interner, eindeutiger Name
    "data[description]": description,
    "data[currency]": currency,
  };
}
// getProductList (readonly) — Antwortform je Version leicht unterschiedlich.
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

const list = await ds24Call("getProductList", apiKey).catch((e) => {
  console.error("Konnte Produktliste nicht laden:", e.message);
  process.exit(1);
});
const existing = extractProducts(list).find(matchesName);
const doUpdate = Boolean(args.update);

if (existing) {
  const pid = productId(existing);
  if (!doUpdate) {
    console.log(
      `✓ Produkt existiert bereits: "${name}" (product_id=${pid}) — nichts zu tun. (--update für Aktualisierung)`,
    );
    process.exit(0);
  }
  // updateProduct: product_id + data[...] (gleiche Keys wie createProduct).
  const updateParams = { product_id: String(pid), ...createProductParams() };
  if (!apply) {
    console.log(`DRY-RUN — Produkt (product_id=${pid}) würde aktualisiert:`);
    console.log(JSON.stringify(updateParams, null, 2));
    console.log("\nZum Ausführen erneut mit --apply aufrufen.");
    process.exit(0);
  }
  await ds24Call("updateProduct", apiKey, updateParams);
  console.log(`✓ Produkt aktualisiert: "${name}" (product_id=${pid})`);
  process.exit(0);
}

if (!apply) {
  console.log("DRY-RUN — es würde folgendes Produkt angelegt:");
  console.log(JSON.stringify(createProductParams(), null, 2));
  console.log("\nZum Ausführen erneut mit --apply aufrufen.");
  process.exit(0);
}

const created = await ds24Call("createProduct", apiKey, createProductParams());
console.log(`✓ Produkt angelegt: "${name}" (product_id=${productId(created) ?? "?"})`);
console.log(
  "Tipp: die product_id als DIGISTORE_PRODUCT_ID_<TARIF> in .env hinterlegen;",
);
console.log("der Preis wird pro Angebot über createBuyUrl gesetzt.");
