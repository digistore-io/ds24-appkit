#!/usr/bin/env node
// Ruft jede Seite der App einmal auf und meldet, welche einen Serverfehler
// wirft. Fängt genau das, was Tests und `npm run build` NICHT fangen: Fehler,
// die erst beim Rendern mit echter Datenbank und echter .env auftreten — der
// klassische „Internal Server Error" auf einer Seite, die nie jemand geöffnet
// hat.
//
// Nutzung (App muss laufen — `make start`):
//   node scripts/dev/smoke.mjs          (oder: make smoke)
//   node scripts/dev/smoke.mjs --url https://staging.example.de
//
// Bewertung:
//   5xx          → FEHLER, Exit-Code 1
//   2xx/3xx/4xx  → in Ordnung. Ein Redirect auf /login ist bei geschützten
//                  Seiten das erwartete Verhalten, kein Mangel.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const baseUrl = (
  args[args.indexOf("--url") + 1]?.startsWith("http")
    ? args[args.indexOf("--url") + 1]
    : process.env.APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

/**
 * Sammelt die statischen Routen aus dem app/-Verzeichnis.
 *
 * Übersprungen werden bewusst:
 *   [param]  — dynamische Segmente; ohne echte ID nicht sinnvoll aufrufbar
 *   (group)  — Route-Gruppen, die nicht in der URL auftauchen
 *   api/     — keine Seiten; die haben eigene Tests
 */
function routenSammeln(verzeichnis = "app", pfad = "") {
  const gefunden = [];
  let eintraege;
  try {
    eintraege = readdirSync(verzeichnis);
  } catch {
    return gefunden;
  }

  if (eintraege.includes("page.tsx") || eintraege.includes("page.jsx")) {
    gefunden.push(pfad === "" ? "/" : pfad);
  }

  for (const eintrag of eintraege) {
    const voll = join(verzeichnis, eintrag);
    if (!statSync(voll).isDirectory()) continue;
    if (eintrag === "api" || eintrag.startsWith("_")) continue;
    if (eintrag.startsWith("[")) continue; // dynamisch — keine echte ID zur Hand
    if (eintrag.startsWith("(")) {
      gefunden.push(...routenSammeln(voll, pfad)); // Gruppe: URL unverändert
      continue;
    }
    gefunden.push(...routenSammeln(voll, `${pfad}/${eintrag}`));
  }
  return gefunden;
}

const routen = [...new Set(routenSammeln())].sort();
if (routen.length === 0) {
  console.error("✗ Keine Seiten unter app/ gefunden — vom Projektstamm aus starten.");
  process.exit(1);
}

console.log(`Prüfe ${routen.length} Seite(n) auf ${baseUrl}\n`);

let fehler = 0;
for (const route of routen) {
  const url = `${baseUrl}${route}`;
  try {
    // redirect: "manual" — ein 307 auf /login ist das Ergebnis, das uns
    // interessiert; ihm zu folgen würde nur wieder /login messen.
    const antwort = await fetch(url, { redirect: "manual" });
    const status = antwort.status;
    if (status >= 500) {
      fehler++;
      console.log(`  ✗ ${status}  ${route}`);
      // Die Fehlerseite von Next enthält im Dev-Modus die Meldung — die
      // erste Zeile davon spart den Griff ins Log.
      const text = await antwort.text();
      const treffer = text.match(/<h2[^>]*>([^<]+)<\/h2>|"message":"([^"]+)"/);
      if (treffer) console.log(`         ${(treffer[1] || treffer[2]).trim()}`);
    } else {
      const hinweis = status >= 300 && status < 400 ? " (Weiterleitung)" : "";
      console.log(`  ✓ ${status}  ${route}${hinweis}`);
    }
  } catch (err) {
    fehler++;
    console.log(`  ✗ ---  ${route} — nicht erreichbar: ${err.message}`);
  }
}

if (fehler > 0) {
  console.error(
    `\n✗ ${fehler} Seite(n) mit Serverfehler.\n` +
      "  Ursache im Log ansehen: make logs\n" +
      "  Nicht ausliefern, bevor das behoben ist.",
  );
  process.exit(1);
}

console.log(`\n✓ Alle ${routen.length} Seite(n) antworten ohne Serverfehler.`);
