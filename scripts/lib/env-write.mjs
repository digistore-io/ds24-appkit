// Einen Schlüssel in eine .env-Datei schreiben — gemeinsam genutzt von den
// ds24-Setup-Skripten (connect-api-key, ipn-setup), damit es genau einen
// .env-Schreiber gibt.
//
// Verhalten: vorhandene Zeile ersetzen (auch eine auskommentierte Vorlage
// `# KEY=`), sonst anhängen. Der Rest der Datei bleibt unangetastet
// (Kommentare inklusive). Fehlt die Datei, wird sie aus .env.example angelegt.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function setEnvValue(file, key, value) {
  if (!existsSync(file)) {
    if (existsSync(".env.example")) {
      writeFileSync(file, readFileSync(".env.example", "utf8"));
      console.log("→ .env aus .env.example angelegt.");
    } else {
      writeFileSync(file, "");
    }
  }
  const inhalt = readFileSync(file, "utf8");
  const zeile = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  const neu = re.test(inhalt)
    ? inhalt.replace(re, zeile)
    : inhalt.replace(/\n*$/, "\n") + zeile + "\n";
  writeFileSync(file, neu);
}
