#!/usr/bin/env node
// Digistore24-IPN-Anbindung einrichten/aktualisieren (idempotent).
//
// Idempotenz über eine STABILE domain_id: existiert bereits eine Anbindung für
// diese domain, aktualisiert ipnSetup sie (und entfernt Duplikate), sonst legt
// es sie neu an. Die domain_id wird in der .env gehalten (DIGISTORE_IPN_DOMAIN_ID),
// damit sie über Läufe hinweg gleich bleibt — entscheidend, weil sich die
// öffentliche URL ändern kann (z. B. bei jedem `make tunnel` eine neue), die
// Anbindung aber dieselbe bleiben soll.
//
// Rückgabe von ipnSetup: { created, updated, deleted, sha_passphrase, ipn_id }.
// Defaults (von DS24 gesetzt) passen zum IPN-Handler dieses Templates:
// transactions = payment/refund/chargeback/payment_missed/last_paid_day,
// timing = before_thankyou, categories = orders.
//
// Passphrase: Eine vorhandene DIGISTORE_IPN_PASSPHRASE wird wiederverwendet
// (echte Idempotenz — die App-Signaturprüfung bleibt gültig). Fehlt sie, erzeugt
// DS24 eine ("random") und dieses Skript schreibt sie in die .env.
//
// Wichtig: DS24 prüft die ipn_url beim Einrichten per GET auf HTTP 200 — die URL
// muss also öffentlich per https erreichbar sein (localhost geht nicht). Die
// IPN-Route dieses Templates beantwortet GET mit "OK".
//
// Nutzung:
//   node scripts/ds24/ipn-setup.mjs --auto --apply
//        # URL aus APP_URL, domain_id aus .env bzw. abgeleitet+gespeichert
//   node scripts/ds24/ipn-setup.mjs --url "https://app.example.de/api/ipn" \
//        --domain "app.example.de" --apply
//   Dry-Run ist Standard. Zum Ausführen: --apply
import { ds24Call, requireApiKey, parseArgs } from "./_client.mjs";
import { setEnvValue } from "../lib/env-write.mjs";

const ENV_FILE = ".env";
const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const auto = Boolean(args.auto);

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// --- IPN-URL: explizit via --url, im --auto-Modus aus APP_URL abgeleitet. ----
let url = args.url;
if (!url && auto) {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  if (appUrl) url = `${appUrl}/api/ipn`;
}

// Ohne öffentliche https-URL lässt sich keine IPN einrichten. Im --auto-Modus
// (Teil von `make ds24-sync`) ist das kein Fehler, sondern der Normalfall in der
// lokalen Entwicklung: überspringen und erklären, statt den ganzen Sync-Lauf
// scheitern zu lassen.
if (!url || !/^https:\/\//.test(url)) {
  if (auto) {
    console.log("• IPN übersprungen — keine öffentliche https-URL vorhanden.");
    console.log("  Digistore24 prüft die IPN-Adresse per Aufruf; localhost geht nicht.");
    console.log("  Sobald die App öffentlich erreichbar ist:");
    console.log("    • live:  APP_URL auf die Domain setzen, dann `make ds24-sync`.");
    console.log("    • lokal: `make tunnel` starten, dessen https-URL als APP_URL, dann erneut.");
    console.log("  Die Produkte sind davon unberührt und wurden bereits synchronisiert.");
    process.exit(0);
  }
  console.error(
    url
      ? "FEHLER: Die IPN-URL muss HTTPS sein."
      : "FEHLER: --url <IPN-Endpoint-URL> erforderlich (oder --auto mit gesetztem APP_URL).",
  );
  process.exit(2);
}

// --- domain_id: --domain > .env (DIGISTORE_IPN_DOMAIN_ID) > abgeleiteter Default.
// Sie muss STABIL sein, sonst legt ipnSetup bei jeder geänderten URL eine neue
// Anbindung an. Deshalb wird ein neu abgeleiteter Wert in die .env geschrieben.
//
// Der Default hängt an der Umgebung, nicht am Hostnamen: In der Entwicklung ist
// die öffentliche URL flüchtig (jeder `make tunnel` liefert eine neue) — hier
// zählt der Projektname als stabile Kennung. In staging/production ist die
// Domain selbst stabil und aussagekräftig.
const istDev = ["", "development", "dev", "local"].includes(
  (process.env.APP_ENV || "").toLowerCase(),
);
let domainId = args.domain || (args.saas ? slug(`${args.saas}-${args.env || "prod"}`) : null);
let domainIdIstNeu = false;
if (!domainId) domainId = process.env.DIGISTORE_IPN_DOMAIN_ID || null;
if (!domainId) {
  const projekt = process.env.APP_NAME || process.cwd().split("/").filter(Boolean).pop() || "app";
  domainId = istDev ? slug(`local-${projekt}`) : slug(new URL(url).hostname);
  domainIdIstNeu = true;
}

const name = args.name || domainId;
const passphraseVorhanden = Boolean(args.passphrase || process.env.DIGISTORE_IPN_PASSPHRASE);
const passphrase = args.passphrase || process.env.DIGISTORE_IPN_PASSPHRASE || "random";
const vendorId = args.vendor ? String(args.vendor) : undefined;

function ipnSetupParams() {
  const p = { ipn_url: url, name, domain_id: domainId, sha_passphrase: passphrase };
  if (vendorId) p.vendor_id = vendorId;
  return p;
}

const apiKey = requireApiKey();

if (!apply) {
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

// Stabile domain_id festhalten, bevor der Call rausgeht — dann ist der nächste
// Lauf idempotent, auch wenn sich die URL geändert hat.
if (domainIdIstNeu) {
  setEnvValue(ENV_FILE, "DIGISTORE_IPN_DOMAIN_ID", domainId);
  console.log(`→ DIGISTORE_IPN_DOMAIN_ID="${domainId}" in ${ENV_FILE} gespeichert.`);
}

const res = await ds24Call("ipnSetup", apiKey, ipnSetupParams());
const action = res.created ? "angelegt" : res.updated ? "aktualisiert" : "gesetzt";
console.log(`✓ IPN-Anbindung ${action}: domain "${domainId}" → ${url}`);
if (res.deleted) console.log(`  (${res.deleted} Duplikat(e) entfernt)`);
console.log(`  ipn_id=${res.ipn_id ?? "?"}`);

if (passphraseVorhanden) {
  console.log("  SHA512-Passphrase: unverändert aus der .env übernommen.");
} else if (res.sha_passphrase) {
  // DS24 hat eine erzeugt — direkt sichern, ab jetzt ist der Lauf idempotent.
  setEnvValue(ENV_FILE, "DIGISTORE_IPN_PASSPHRASE", res.sha_passphrase);
  console.log(`  ✓ SHA512-Passphrase erzeugt und als DIGISTORE_IPN_PASSPHRASE in ${ENV_FILE} gespeichert.`);
} else {
  console.log("  (Keine Passphrase zurückgegeben — bitte manuell prüfen.)");
}
