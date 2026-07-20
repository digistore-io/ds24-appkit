#!/usr/bin/env node
// Setzt die lokale Entwicklungs-Datenbank zurück: Schema löschen → alle
// Migrationen aus drizzle/ neu einspielen → Seed (falls vorhanden).
//
// Nutzung:  npm run db:reset      (oder: make db-reset)
//
// SICHERHEIT: Dieses Skript LÖSCHT ALLE DATEN. Es verweigert den Dienst, wenn
// die Datenbank nicht lokal aussieht oder APP_ENV=production ist. Mit --force
// lässt sich das übergehen — bitte nur, wenn du dir sicher bist.
import { execFileSync } from "node:child_process";
import "../lib/env.mjs";
import { existsSync } from "node:fs";
import postgres from "postgres";

const force = process.argv.includes("--force");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "FEHLER: DATABASE_URL ist nicht gesetzt (siehe .env / .env.example).",
  );
  process.exit(2);
}

// Nur lokale Datenbanken zurücksetzen. Alles andere könnte Kundendaten sein.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "db", "postgres"];
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
const isLocal = LOCAL_HOSTS.includes(host);
const isProd = process.env.APP_ENV === "production";

if ((!isLocal || isProd) && !force) {
  console.error(
    `ABBRUCH: db:reset löscht ALLE Daten, und diese Datenbank sieht nicht lokal aus.\n` +
      `  Host:    ${host || "(unbekannt)"}\n` +
      `  APP_ENV: ${process.env.APP_ENV ?? "(nicht gesetzt)"}\n\n` +
      `In Produktion gibt es kein Reset — dort gilt: npm run db:migrate.\n` +
      `Wenn du es wirklich willst: npm run db:reset -- --force`,
  );
  process.exit(2);
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

console.log(`>> Schemata löschen und neu anlegen (${host})`);
const sql = postgres(url, { max: 1 });
try {
  // 'public' = die Tabellen der App.
  await sql.unsafe("drop schema if exists public cascade");
  // 'drizzle' = das Migrations-Journal (__drizzle_migrations). Muss mit weg —
  // sonst hält Drizzle alle Migrationen für bereits eingespielt und legt in der
  // leeren Datenbank keine einzige Tabelle mehr an.
  await sql.unsafe("drop schema if exists drizzle cascade");
  await sql.unsafe("create schema public");
} catch (e) {
  console.error("FEHLER beim Zurücksetzen des Schemas:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}

console.log(">> Migrationen einspielen (drizzle/)");
run("npx", ["drizzle-kit", "migrate"]);

if (existsSync("scripts/db/seed.mjs")) {
  console.log(">> Seed einspielen (scripts/db/seed.mjs)");
  run("node", ["scripts/db/seed.mjs"]);
}

console.log("✓ Datenbank ist frisch aufgebaut.");
