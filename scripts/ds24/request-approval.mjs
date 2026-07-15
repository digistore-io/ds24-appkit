#!/usr/bin/env node
// Digistore24-Produkt-Approval beantragen (Go-Live-Schritt).
//
// Setzt je Produkt via updateProduct den Freigabe-Status:
//   data[approval_status][<siteowner_id>] = <status>   (Default: "requested")
//
// Hintergrund (updateProduct.expectedArgs): approval_status ist "by_siteowner" —
// die Freigabe wird pro Siteowner beantragt und greift nur für Siteowner, für die
// der Verkäufer akzeptiert ist. Für den Verkauf über den Digistore24-Marktplatz
// ist die Siteowner-ID die des Marktplatzes; sie steht im DS24-Konto (bzw. beim
// Support erfragbar) und wird über --siteowner / DIGISTORE_SITEOWNER_ID gesetzt.
//
// Nutzung:
//   node scripts/ds24/request-approval.mjs --siteowner <id>            # Dry-Run
//   node scripts/ds24/request-approval.mjs --siteowner <id> --apply
//   node scripts/ds24/request-approval.mjs --siteowner <id> --key pro --apply
//   [--status requested]
// Env: DIGISTORE_API_KEY (writable), optional DIGISTORE_URL, DIGISTORE_SITEOWNER_ID.
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { readProducts } from "./_products.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const onlyKey = args.key ? String(args.key) : null;
const status = args.status ? String(args.status) : "requested";
const siteowner = args.siteowner
  ? String(args.siteowner)
  : process.env.DIGISTORE_SITEOWNER_ID || null;

if (!siteowner) {
  console.error(
    "FEHLER: --siteowner <id> (oder DIGISTORE_SITEOWNER_ID) erforderlich.\n" +
      "Die Siteowner-ID des Digistore24-Marktplatzes findest du in deinem DS24-Konto.",
  );
  process.exit(2);
}

const apiKey = requireApiKey();
const config = readProducts();
const entries = Object.entries(config.products).filter(
  ([key]) => !onlyKey || key === onlyKey,
);

let any = false;
for (const [key, def] of entries) {
  if (!def.productId) {
    console.log(`· übersprungen: "${key}" (noch keine productId — erst sync-products).`);
    continue;
  }
  any = true;
  const params = {
    product_id: String(def.productId),
    [`data[approval_status][${siteowner}]`]: status,
  };
  if (!apply) {
    console.log(
      `DRY-RUN — würde Approval "${status}" beantragen: "${key}" (product_id=${def.productId}, siteowner=${siteowner})`,
    );
    continue;
  }
  await ds24Call("updateProduct", apiKey, params);
  console.log(`✓ Approval "${status}" beantragt: "${key}" (product_id=${def.productId})`);
}

if (!any) {
  console.error("Keine synchronisierten Produkte gefunden. Erst 'sync-products.mjs --apply' ausführen.");
  process.exit(1);
}
if (!apply) console.log("\nZum Ausführen erneut mit --apply aufrufen.");
