#!/usr/bin/env node
// Digistore24-API-Key besorgen und in die .env schreiben.
//
// Zwei Wege:
//
//  A) Standard — vollautomatisch. Das Skript startet einen kurzlebigen lokalen
//     Server, öffnet die Digistore24-Freigabeseite im Browser, fängt die
//     Rückleitung ab und holt den fertigen API-Key ab. Nutzt den eingebauten
//     Developer-Key; ein eigener lässt sich per DIGISTORE_DEVELOPER_KEY in der
//     .env setzen.
//
//  B) --manual: Das Skript öffnet die Digistore24-Seite, auf der du dir selbst
//     einen API-Key erzeugst, und du fügst ihn hier ein.
//
// In beiden Fällen landet der Key in der lokalen `.env` — die steht in
// .gitignore und wird NICHT eingecheckt.
//
// Ablauf laut DS24-Doku: requestApiKey (mit Developer-Key) → Nutzer bestätigt
// auf request_url → Rückleitung auf return_url → retrieveApiKey(token) → api_key.
// https://dev.digistore24.com/hc/en-us/articles/32486158815121
//
// Verbindung wieder lösen: die DS24-Funktion `unregister()` löscht den Key
// serverseitig samt zugehöriger IPN-Verbindungen — danach den Wert aus der .env
// entfernen.
//
// Nutzung:
//   node scripts/ds24/connect-api-key.mjs           (oder: make ds24-connect)
//   node scripts/ds24/connect-api-key.mjs --manual  (Weg B erzwingen)
//   node scripts/ds24/connect-api-key.mjs --print   (nichts schreiben, nur zeigen)
//   node scripts/ds24/connect-api-key.mjs --port 53682   (anderer lokaler Port)
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import "../lib/env.mjs";
import { ds24Call, parseArgs } from "./_client.mjs";
import { setEnvValue } from "../lib/env-write.mjs";

// Eingebauter Developer-Key. Ein Developer-Key trägt keine Kontorechte, er
// identifiziert nur die aufrufende Anwendung — die Rolle einer OAuth-Client-ID.
// Kein Geheimnis, deshalb offen im Code und bewusst nicht verschleiert. Der
// rechtetragende API-Key entsteht erst, wenn der Merchant den Zugriff im
// Browser freigibt, und liegt danach ausschließlich in dessen lokaler .env.
const BUILT_IN_DEVELOPER_KEY =
  "1706550-aASzoSnqcChueKmMDBvcwqUWvOqnfhXTncfkTN6X"; // gitleaks:allow trufflehog:ignore pragma: allowlist secret NOSONAR nosemgrep

const args = parseArgs(process.argv.slice(2));
const printOnly = Boolean(args.print);
const devKey = process.env.DIGISTORE_DEVELOPER_KEY || BUILT_IN_DEVELOPER_KEY;
const manual = Boolean(args.manual);
const baseUrl = (process.env.DIGISTORE_URL || "https://www.digistore24.com").replace(/\/$/, "");
const ENV_FILE = ".env";
const CALLBACK_PORT = Number(args.port || 53682);

// Rückleitungs-Adresse. Digistore24 akzeptiert als return_url KEINE
// localhost-Adresse — der lokale Listener ist aber genau dort. Deshalb der
// Umweg über eine öffentliche Mini-Seite, die den Browser an 127.0.0.1
// weiterschickt; der Port geht als GET-Parameter mit. Die Seite sieht den
// API-Key nie: der wird unten per retrieveApiKey direkt zwischen diesem Skript
// und Digistore24 getauscht, über die Rückleitung kommt nur das Signal
// "freigegeben". Quelltext der Seite: connect-site/ im Template-Source-Repo.
const RELAY_URL = (
  process.env.DIGISTORE_CONNECT_RELAY ||
  "https://digistore24-app-template.com/connect/return"
).replace(/\/$/, "");
// Nur zum Testen gegen einen DS24-Testhost, der localhost durchlässt.
const ohneRelay = Boolean(args["no-relay"]);

/** Öffnet eine URL im Standardbrowser (best effort, plattformübergreifend). */
function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open";
  try {
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function zeigeLink(url, hinweis) {
  console.log(`\n${hinweis}`);
  console.log(`\n  ${url}\n`);
  if (!openBrowser(url)) {
    console.log("(Browser konnte nicht automatisch geöffnet werden — Link oben kopieren.)");
  } else {
    console.log("(Browser wurde geöffnet. Falls nicht: Link oben kopieren.)");
  }
}

function fertig(apiKey, extras = {}) {
  if (printOnly) {
    console.log(`\nAPI-Key (nicht gespeichert): ${apiKey}`);
    return;
  }
  setEnvValue(ENV_FILE, "DIGISTORE_API_KEY", apiKey);
  for (const [k, v] of Object.entries(extras)) if (v) setEnvValue(ENV_FILE, k, v);
  console.log(`\n✓ DIGISTORE_API_KEY in ${ENV_FILE} gespeichert.`);
  console.log("  .env steht in .gitignore — der Schlüssel landet nicht im Repository.");
  console.log("\nNächster Schritt: make ds24-sync ARGS=--apply");
}

// ---------------------------------------------------------------------------
// Weg B — manuell: Seite öffnen, Key einfügen.
// ---------------------------------------------------------------------------
async function manuellerWeg() {
  zeigeLink(
    `${baseUrl}/settings/account-access`,
    "Erzeuge dir bei Digistore24 einen API-Key:",
  );
  console.log("Dort: Einstellungen \u2192 Kontozugriff \u2192 Reiter \u201eAPI-Keys\u201c \u2192");
  console.log("\u201eNeuer API-Key\u201c \u2192 als Berechtigung \u201ewritable\u201c w\u00e4hlen \u2192 Speichern.");
  console.log("");
  console.log("Ohne Schreibrechte kann die App keine Produkte anlegen und keine");
  console.log("Checkout-Links erzeugen.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = (await rl.question("API-Key hier einfügen: ")).trim();
  rl.close();

  if (!key) {
    console.error("\n✗ Kein Key eingegeben — abgebrochen.");
    process.exit(1);
  }
  fertig(key);
}

// ---------------------------------------------------------------------------
// Weg A — automatisch über den Developer-Key.
// ---------------------------------------------------------------------------
async function automatischerWeg() {
  const returnUrl = ohneRelay
    ? `http://127.0.0.1:${CALLBACK_PORT}/callback`
    : `${RELAY_URL}?port=${CALLBACK_PORT}&path=%2Fcallback`;
  const permissions = process.env.DIGISTORE_REQUESTED_PERMISSIONS || "writable";

  // DS24 verlangt auch für site_url zwingend https — ein http://localhost lehnt
  // die API ab. Bei lokaler Entwicklung (APP_URL ist http/localhost) deshalb die
  // öffentliche Relay-Domain als Kennung schicken; nur ein echtes https-APP_URL
  // wird durchgereicht.
  const appUrl = process.env.APP_URL || "";
  const siteUrl = appUrl.startsWith("https://")
    ? appUrl
    : new URL(RELAY_URL).origin;

  const antwort = await ds24Call("requestApiKey", devKey, {
    permissions,
    return_url: returnUrl,
    cancel_url: returnUrl,
    site_url: siteUrl,
    comment: "SAAS-App (Terminal-Setup)",
  });
  const requestUrl = antwort?.request_url;
  const requestToken = antwort?.request_token;
  if (!requestUrl || !requestToken) {
    console.error("✗ Digistore24 lieferte keine request_url/request_token.");
    process.exit(1);
  }

  // Auf die Rückleitung warten — der Server lebt nur für diesen einen Aufruf.
  const gewartet = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<html><body style='font-family:sans-serif;padding:2rem'>" +
          "<h1>Fertig</h1><p>Du kannst dieses Fenster schließen und ins Terminal zurückkehren.</p>" +
          "</body></html>",
      );
      server.close();
      resolve();
    });
    server.on("error", reject);
    server.listen(CALLBACK_PORT, "127.0.0.1");
    // Nicht ewig hängen bleiben, wenn der Nutzer abbricht.
    setTimeout(() => {
      server.close();
      reject(new Error("Zeitüberschreitung (5 Minuten) — nichts gespeichert."));
    }, 300_000).unref();
  });

  zeigeLink(requestUrl, "Bitte den Zugriff bei Digistore24 freigeben:");
  console.log("Warte auf die Freigabe …");
  await gewartet;

  const ergebnis = await ds24Call("retrieveApiKey", devKey, { token: requestToken });
  if (ergebnis?.request_status !== "completed" || !ergebnis?.api_key) {
    console.error(
      `\n✗ Freigabe nicht abgeschlossen (Status: ${ergebnis?.request_status || "unbekannt"}).`,
    );
    process.exit(1);
  }
  // Die SHA-Passphrase kommt bei manchen Konten gleich mit — dann gleich sichern.
  fertig(ergebnis.api_key, {
    DIGISTORE_IPN_PASSPHRASE: ergebnis.thankyou_page_key,
  });
}

if (manual) {
  await manuellerWeg();
} else {
  await automatischerWeg();
}
