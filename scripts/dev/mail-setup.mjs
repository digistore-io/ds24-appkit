#!/usr/bin/env node
// E-Mail-Versand für den Login einrichten — interaktiv.
//
// Fragt die Zugangsdaten ab, schreibt sie in die .env (die ist gitignored) und
// verschickt auf Wunsch eine Testmail. Danach verschwindet der
// Entwicklungs-Login automatisch, und der Magic-Link-Login ist aktiv.
//
// Zwei Wege — genau EINER wird konfiguriert:
//   Postmark  Dienst mit kostenlosem Kontingent; braucht einen Server-Token
//             und eine verifizierte Absenderadresse (Sender Signature).
//   SMTP      Jeder Mailserver/jedes Postfach (auch der eigene Provider).
//
// Nutzung:  node scripts/dev/mail-setup.mjs   (oder: make mail-setup)
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import "../lib/env.mjs";

const ENV_FILE = ".env";
const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Frage mit optionalem Vorgabewert. */
async function frage(text, vorgabe = "") {
  const zusatz = vorgabe ? ` [${vorgabe}]` : "";
  const antwort = (await rl.question(`${text}${zusatz}: `)).trim();
  return antwort || vorgabe;
}

/** Pflichtfeld — fragt so lange, bis etwas da ist. */
async function pflicht(text, vorgabe = "") {
  for (;;) {
    const wert = await frage(text, vorgabe);
    if (wert) return wert;
    console.log("  (Pflichtangabe)");
  }
}

/**
 * Schreibt Werte in die .env: vorhandene (auch auskommentierte) Zeilen werden
 * ersetzt, fehlende angehängt. Der Rest der Datei bleibt unangetastet.
 */
function schreibeEnv(werte) {
  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "");
  }
  let inhalt = readFileSync(ENV_FILE, "utf8");
  for (const [key, value] of Object.entries(werte)) {
    const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
    const zeile = `${key}=${value}`;
    inhalt = re.test(inhalt)
      ? inhalt.replace(re, zeile)
      : inhalt.replace(/\n*$/, "\n") + zeile + "\n";
  }
  writeFileSync(ENV_FILE, inhalt);
}

/** Kommentiert Zeilen aus, damit nicht zwei Transporte gleichzeitig gesetzt sind. */
function deaktiviere(keys) {
  if (!existsSync(ENV_FILE)) return;
  let inhalt = readFileSync(ENV_FILE, "utf8");
  for (const key of keys) {
    inhalt = inhalt.replace(new RegExp(`^(${key}=.*)$`, "m"), "# $1");
  }
  writeFileSync(ENV_FILE, inhalt);
}

// Verschickt eine Testmail mit den gerade eingegebenen Werten (der Aufrufer
// legt sie vorher per Object.assign in process.env).
async function testmail(an) {
  const istPostmark = Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_SENDER);
  const von = istPostmark ? process.env.POSTMARK_SENDER : process.env.SMTP_FROM || process.env.EMAIL_FROM;
  const betreff = "Testmail aus deiner App";
  const text = "Wenn du das liest, funktioniert der E-Mail-Versand.\nDer Login per Magic-Link ist jetzt einsatzbereit.";

  if (istPostmark) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: von,
        To: an,
        Subject: betreff,
        TextBody: text,
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
      }),
    });
    if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
    return;
  }

  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  await transport.sendMail({ from: von, to: an, subject: betreff, text });
}

// ---------------------------------------------------------------------------

console.log("\nE-Mail-Versand für den Login einrichten");
console.log("──────────────────────────────────────");
console.log("Der Anmelde-Link (Magic-Link) wird per E-Mail verschickt. Dafür");
console.log("braucht die App ein Mail-Konto. Solange keins eingerichtet ist,");
console.log("gibt es lokal den Entwicklungs-Login — in Staging und Produktion");
console.log("aber nicht: dort ist der Versand Pflicht.\n");
console.log("  1) Postmark  — Dienst, kostenloses Kontingent, sehr zuverlässig");
console.log("  2) SMTP      — eigener Mailserver oder Postfach deines Providers\n");

const wahl = await frage("Womit möchtest du versenden? (1/2)", "1");

let werte;
if (wahl === "2" || wahl.toLowerCase().startsWith("s")) {
  console.log("\nSMTP-Zugangsdaten (findest du bei deinem Mail-Anbieter):");
  const host = await pflicht("  Server (SMTP_HOST), z. B. smtp.strato.de", process.env.SMTP_HOST || "");
  const port = await frage("  Port (587 = STARTTLS, 465 = SSL)", process.env.SMTP_PORT || "587");
  const user = await pflicht("  Benutzername", process.env.SMTP_USER || "");
  const pass = await pflicht("  Passwort", process.env.SMTP_PASSWORD || "");
  const from = await pflicht("  Absenderadresse (From)", process.env.SMTP_FROM || user);
  werte = {
    SMTP_HOST: host,
    SMTP_PORT: port,
    SMTP_SECURE: port === "465" ? "true" : "false",
    SMTP_USER: user,
    SMTP_PASSWORD: pass,
    SMTP_FROM: from,
    EMAIL_FROM: from,
  };
  deaktiviere(["POSTMARK_SERVER_TOKEN", "POSTMARK_SENDER"]);
} else {
  console.log("\nPostmark-Zugangsdaten (Server → API Tokens):");
  console.log("Die Absenderadresse muss dort als Sender Signature verifiziert sein.");
  const token = await pflicht("  Server-Token", process.env.POSTMARK_SERVER_TOKEN || "");
  const sender = await pflicht("  Absenderadresse", process.env.POSTMARK_SENDER || "");
  const stream = await frage("  Message-Stream", process.env.POSTMARK_MESSAGE_STREAM || "outbound");
  werte = {
    POSTMARK_SERVER_TOKEN: token,
    POSTMARK_SENDER: sender,
    POSTMARK_MESSAGE_STREAM: stream,
    EMAIL_FROM: sender,
  };
  deaktiviere(["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]);
}

schreibeEnv(werte);
console.log(`\n✓ In ${ENV_FILE} gespeichert (die Datei ist gitignored).`);

const an = await frage("\nTestmail verschicken an (leer = überspringen)", "");
if (an) {
  try {
    Object.assign(process.env, werte);
    await testmail(an);
    console.log(`✓ Testmail an ${an} verschickt. Schau in dein Postfach (auch Spam).`);
  } catch (e) {
    console.error(`\n✗ Versand fehlgeschlagen: ${e.message}`);
    console.error("  Zugangsdaten prüfen und `make mail-setup` erneut ausführen.");
    rl.close();
    process.exit(1);
  }
}

console.log("\nNächster Schritt: make restart");
console.log("Danach ist der Login per Magic-Link aktiv und der Entwicklungs-Login weg.");
rl.close();
