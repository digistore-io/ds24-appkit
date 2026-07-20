#!/usr/bin/env node
// Digistore24-Produkte aus der Registry synchronisieren (idempotent).
//
// Liest config/digistore-products.json, legt jedes Produkt via createProduct an
// bzw. aktualisiert es via updateProduct und schreibt die erzeugte `productId`
// zurück in die Config. So ist die Config die Source of Truth und der Checkout
// (Produkt-Link …/product/<id>) hat stabile IDs.
//
// WICHTIG — warum hier kein Preis gesetzt wird:
// Die DS24-API verwirft `data[amount]` ausdrücklich ("is deprecated - create a
// payment plan instead"), und es gibt KEINEN API-Endpunkt, um Bezahlpläne
// anzulegen. Deshalb geht dieses Template den anderen Weg: Preis und Intervall
// werden beim Checkout aus der Registry als `payment_plan[...]` an createBuyUrl
// übergeben (lib/digistore/buyUrl.ts). Du musst also in der DS24-Oberfläche
// KEINE Bezahlpläne pflegen — priceCents/billingInterval in der Registry genügen.
//
// Dieses Skript verwaltet die Produkt-Stammdaten: Name, interner Name,
// Beschreibung, Produktbild, Thank-You-URL, Mengen — und die productId.
//
// Matching/Idempotenz: 1) vorhandene productId aus der Config, sonst
// 2) name_intern/name in getProductList → keine Duplikate. `name_intern` ist
// der stabile Registry-Schlüssel, damit ein geänderter Anzeigename das
// Wiederfinden nicht bricht.
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
function productData(key, def) {
  const data = {
    "data[name]": def.name,
    // Stabiler interner Name = Registry-Schlüssel. Der Anzeigename darf sich
    // dadurch jederzeit ändern, ohne dass das Wiederfinden bricht.
    "data[name_intern]": key,
    "data[description]": def.description || def.name,
    "data[currency]": def.currency || "EUR",
  };
  if (appUrl) data["data[thankyou_url]"] = appUrl;
  // Produktbild: öffentlich erreichbare URL, sonst lehnt DS24 sie ab.
  if (def.imageUrl) data["data[image_url]"] = def.imageUrl;
  // Token-Pakete sind Mengenprodukte: genau 1 Paket je Kauf, sonst stimmt die
  // Gutschrift (credits) nicht mehr mit dem Kauf überein.
  if (def.kind === "token") {
    data["data[default_quantity]"] = "1";
    data["data[max_quantity]"] = "1";
  }
  return data;
}

// Warnt bei Registry-Einträgen, die später im Checkout auffallen würden.
function pruefeDefinition(key, def) {
  const warn = [];
  if (def.priceCents == null)
    warn.push("kein priceCents — der Checkout kann keinen Preis setzen");
  if (def.kind === "subscription" && !def.billingInterval)
    warn.push("kind=subscription ohne billingInterval (z. B. 1_month)");
  if (def.kind === "token" && !def.credits)
    warn.push("kind=token ohne credits — es würde kein Guthaben gutgeschrieben");
  if (def.imageUrl && !/^https:\/\//.test(def.imageUrl))
    warn.push("imageUrl ist keine https-URL — DS24 lehnt sie ab");
  for (const w of warn) console.warn(`  ! ${key}: ${w}`);
  return warn.length;
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
// Matching: erst über den stabilen Registry-Schlüssel (name_intern), dann über
// den Anzeigenamen — Letzteres fängt Produkte ab, die vor dieser Konvention
// bereits von Hand in DS24 angelegt wurden.
function findExisting(key, name) {
  return (
    list.find((p) => p.name_intern === key) ||
    list.find(
      (p) => p.name === name || p.name_intern === name || p.product_name === name,
    )
  );
}

let changed = false;
let warnungen = 0;
for (const [key, def] of entries) {
  warnungen += pruefeDefinition(key, def);
  const data = productData(key, def);
  const existingId = def.productId || idOf(findExisting(key, def.name) || {});

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
}

if (warnungen > 0) {
  console.log(
    `\n${warnungen} Hinweis(e) oben pruefen — sie fallen sonst erst beim Checkout auf.`,
  );
}

console.log(
  "\nPreise kommen aus der Registry (priceCents/billingInterval) und werden beim\n" +
    "Checkout als payment_plan uebergeben. In DS24 sind KEINE Bezahlplaene noetig.",
);
