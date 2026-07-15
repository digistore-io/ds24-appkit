#!/usr/bin/env node
// Digistore24-IPN-Anbindung einrichten/aktualisieren (idempotent).
//
// ipnSetup ist von Haus aus idempotent über `domain_id`: existiert bereits eine
// Anbindung für diese domain, wird sie aktualisiert (und Duplikate entfernt),
// sonst neu angelegt. Rückgabe: { created, updated, deleted, sha_passphrase, ipn_id }.
//
// Parameter gemäß echter DS24-API (ipnSetup.expectedArgs):
//   ipn_url (Pflicht), name, domain_id, sha_passphrase, vendor_id
//   Defaults passen bereits: transactions = payment/refund/chargeback/
//   payment_missed/last_paid_day, timing = before_thankyou, categories = orders.
//
// SHA-Passphrase: Mit --passphrase <wert> wird die Passphrase gesetzt, die die
// App zur SHA512-Prüfung nutzt (vendor_settings.ds24_ipn_passphrase). Ohne Angabe
// wird "random" verwendet — DS24 erzeugt eine und gibt sie zurück; DIESE dann in
// der App hinterlegen.
//
// Wichtig: DS24 prüft die ipn_url beim Einrichten per GET auf HTTP 200. Die
// IPN-Route dieses Templates beantwortet GET mit "OK" — das passt.
//
// Nutzung:
//   node scripts/ds24/ipn-setup.mjs \
//        --url "https://app.example.de/api/ipn/<vendor>" \
//        --saas "Paid Challenge" --env prod            # domain_id = "paid-challenge-prod"
//        [--passphrase "<aus App-Onboarding>"] [--vendor <vendor_id>]
//   Dry-Run ist Standard. Zum Ausführen: --apply
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);

const url = args.url;
if (!url) {
  console.error("FEHLER: --url <IPN-Endpoint-URL> erforderlich.");
  process.exit(2);
}
if (!/^https:\/\//.test(url)) {
  console.error("FEHLER: Die IPN-URL muss HTTPS sein.");
  process.exit(2);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const domainId =
  args.domain ||
  (args.saas ? slug(`${args.saas}-${args.env || "prod"}`) : null);
if (!domainId) {
  console.error(
    'FEHLER: --domain "..." oder --saas "..." [--env prod] erforderlich.',
  );
  process.exit(2);
}
const name = args.name || (args.saas ? `${args.saas} - ${args.env || "prod"}` : "[SITE]");
const passphrase = args.passphrase || "random";
const vendorId = args.vendor ? String(args.vendor) : undefined;

// ipnSetup-Parameter (verifiziert). Defaults für categories/transactions/timing
// werden von DS24 gesetzt und passen zum IPN-Handler dieses Templates.
function ipnSetupParams() {
  const p = {
    ipn_url: url,
    name,
    domain_id: domainId,
    sha_passphrase: passphrase,
  };
  if (vendorId) p.vendor_id = vendorId;
  return p;
}

const apiKey = requireApiKey();

if (!apply) {
  // Vorschau: existiert die domain schon? (ipnInfo, rein informativ)
  const infoParams = { domain_id: domainId };
  if (vendorId) infoParams.vendor_id = vendorId;
  const info = await ds24Call("ipnInfo", apiKey, infoParams).catch(() => null);
  const exists = info?.have_settings === true;
  console.log(
    exists
      ? `DRY-RUN — bestehende IPN-Anbindung für domain "${domainId}" würde aktualisiert:`
      : `DRY-RUN — neue IPN-Anbindung für domain "${domainId}" würde eingerichtet:`,
  );
  const preview = ipnSetupParams();
  if (preview.sha_passphrase === "random")
    preview.sha_passphrase = "<random — DS24 erzeugt & gibt zurück>";
  console.log(JSON.stringify(preview, null, 2));
  console.log("\nZum Ausführen erneut mit --apply aufrufen.");
  process.exit(0);
}

const res = await ds24Call("ipnSetup", apiKey, ipnSetupParams());
const action = res.created ? "angelegt" : res.updated ? "aktualisiert" : "gesetzt";
console.log(`✓ IPN-Anbindung ${action}: domain "${domainId}" → ${url}`);
if (res.deleted) console.log(`  (${res.deleted} Duplikat(e) entfernt)`);
console.log(`  ipn_id=${res.ipn_id ?? "?"}`);
if (args.passphrase) {
  console.log("  SHA512-Passphrase: wie übergeben (identisch zur App).");
} else {
  console.log(`\n  WICHTIG: Diese von DS24 erzeugte SHA512-Passphrase in der App`);
  console.log(`  (vendor_settings.ds24_ipn_passphrase) hinterlegen:`);
  console.log(`  ${res.sha_passphrase ?? "(nicht zurückgegeben)"}`);
}
