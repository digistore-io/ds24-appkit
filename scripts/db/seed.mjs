#!/usr/bin/env node
// Seed — Ausgangsdaten für die lokale Entwicklung.
//
// Läuft automatisch am Ende von `make db-reset` und einzeln per `make db-seed`.
// Muss idempotent sein: mehrfaches Ausführen darf nichts kaputt machen (deshalb
// überall "on conflict do update/nothing").
//
// Hier gehören Entwicklungs-Daten hinein (Admin-Account, Beispiel-Inhalte) —
// KEINE echten Kundendaten und keine Secrets.
import { randomUUID } from "node:crypto";
import "../lib/env.mjs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("FEHLER: DATABASE_URL ist nicht gesetzt (siehe .env).");
  process.exit(2);
}

// Admin-Adresse frei wählbar:  SEED_OWNER_EMAIL=ich@example.de make db-seed
const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? "admin@example.de")
  .trim()
  .toLowerCase();
const memberEmail = (process.env.SEED_MEMBER_EMAIL ?? "kunde@example.de")
  .trim()
  .toLowerCase();

const sql = postgres(url, { max: 1 });
try {
  for (const [email, role] of [
    [ownerEmail, "owner"],
    [memberEmail, "member"],
  ]) {
    await sql`
      insert into users (id, email, role)
      values (${randomUUID()}, ${email}, ${role})
      on conflict (email) do update set role = excluded.role
    `;
    console.log(`✓ Benutzer: ${email} (${role})`);
  }
  console.log(
    "\nEinloggen: http://localhost:3000/login — Magic-Link an die obige Adresse.",
  );
} catch (e) {
  console.error("FEHLER im Seed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
