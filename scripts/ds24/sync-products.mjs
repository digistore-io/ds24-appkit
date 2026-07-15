#!/usr/bin/env node
// Digistore24-Produkte aus der Registry synchronisieren (idempotent).
//
// Liest config/digistore-products.json, legt jedes Produkt via createProduct an
// bzw. aktualisiert es via updateProduct und schreibt die erzeugte `productId`
// zurück in die Config. So ist die Config die Source of Truth und der Checkout
// (Produkt-Link …/product/<id>) hat stabile IDs.
//
// WICHTIG: Der PREIS wird NICHT hier gesetzt (data[amount] ist bei DS24
// deprecated). Preis/Intervall je Produkt als DS24-Payment-Plan in der DS24-
// Oberfläche pflegen. Dieses Skript verwaltet nur die Produkt-Stammdaten
// (Name, Beschreibung, Thank-You-URL) + die productId.
//
// Matching/Idempotenz: 1) vorhandene productId aus der Config, sonst
// 2) name_intern/name in getProductList → keine Duplikate.
//
// Nutzung:
//   node scripts/ds24/sync-products.mjs                 # Dry-Run (alle)
//   node scripts/ds24/sync-products.mjs --apply         # anlegen/aktualisieren
//   node scripts/ds24/sync-products.mjs --key pro --apply
//   [--thankyou "https://app.example.de/optin/[ORDER_ID]"]  # sonst aus APP_URL
// Env: DIGISTORE_API_KEY (writable), optional DIGISTORE_URL, APP_URL.
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { readProducts, writeProducts, extractProducts, idOf } from "./_products.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const onlyKey = args.key ? String(args.key) : null;

const appUrl = args.thankyou
  ? String(args.thankyou)
  : process.env.APP_URL
    ? `${process.env.APP_URL.replace(/\/$/, "")}/optin/[ORDER_ID]`
    : null;

// data[...] für create/update aus einer Registry-Definition (ohne Preis).
function productData(def) {
  const data = {
    "data[name]": def.name,
    "data[name_intern]": def.name,
    "data[description]": def.description || def.name,
    "data[currency]": def.currency || "EUR",
  };
  if (appUrl) data["data[thankyou_url]"] = appUrl;
  return data;
}

const apiKey = requireApiKey();
const config = readProducts();
const entries = Object.entries(config.products).filter(
  ([key]) => !onlyKey || key === onlyKey,
);
if (entries.length === 0) {
  console.error(onlyKey ? `Kein Produkt "${onlyKey}" in der Config.` : "Keine Produkte in der Config.");
  process.exit(2);
}

// Produktliste einmal laden (für Matching per Name).
const list = extractProducts(
  await ds24Call("getProductList", apiKey).catch((e) => {
    console.error("Konnte Produktliste nicht laden:", e.message);
    process.exit(1);
  }),
);
function findByName(name) {
  return list.find(
    (p) => p.name === name || p.name_intern === name || p.product_name === name,
  );
}

let changed = false;
for (const [key, def] of entries) {
  const data = productData(def);
  const existingId = def.productId || idOf(findByName(def.name) || {});

  if (existingId) {
    if (!apply) {
      console.log(`DRY-RUN — würde aktualisieren: "${key}" (product_id=${existingId})`);
    } else {
      await ds24Call("updateProduct", apiKey, { product_id: String(existingId), ...data });
      console.log(`✓ aktualisiert: "${key}" (product_id=${existingId})`);
    }
    if (def.productId !== String(existingId)) {
      config.products[key].productId = String(existingId);
      changed = true;
    }
    continue;
  }

  if (!apply) {
    console.log(`DRY-RUN — würde anlegen: "${key}" (${def.name})`);
    continue;
  }
  const created = await ds24Call("createProduct", apiKey, data);
  const newId = idOf(created);
  if (!newId) {
    console.error(`✗ createProduct lieferte keine product_id für "${key}".`);
    process.exit(1);
  }
  config.products[key].productId = String(newId);
  changed = true;
  console.log(`✓ angelegt: "${key}" (product_id=${newId})`);
}

if (apply && changed) {
  writeProducts(config);
  console.log("→ productId(s) in config/digistore-products.json geschrieben.");
} else if (!apply) {
  console.log("\nZum Ausführen erneut mit --apply aufrufen.");
  console.log("Danach je Produkt in DS24 einen Payment-Plan (Preis/Intervall) anlegen.");
}
