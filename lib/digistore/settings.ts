// Digistore24-Zugangsdaten des Betreibers.
//
// Ein-Betreiber-Modell: Diese App rechnet über genau EIN Digistore24-Konto ab.
// Die Zugangsdaten stehen deshalb in der Umgebung und nicht in der Datenbank —
// abgeholt und in die `.env` geschrieben von `make ds24-connect`
// (scripts/ds24/connect-api-key.mjs).
//
// Es gibt bewusst keine Oberfläche, um Schlüssel einzutragen: Ein Eingabefeld
// für ein Secret ist eine zusätzliche Angriffsfläche, und der Schlüssel gehört
// dem Betreiber der Installation, nicht einem eingeloggten Benutzer.
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Schreibender API-Key für die Digistore24-REST-API.
 * Wirft, wenn nicht gesetzt — kein stiller Fallback (siehe CLAUDE.md).
 */
export function ds24ApiKey(): string {
  const key = process.env.DIGISTORE_API_KEY;
  if (!key) {
    throw new Error(
      "DIGISTORE_API_KEY fehlt. Verbindung herstellen mit: make ds24-connect",
    );
  }
  return key;
}

/**
 * Passphrase für die SHA512-Prüfung eingehender IPN-Calls.
 * Gibt null zurück, wenn nicht gesetzt — der IPN-Endpoint lehnt dann ab
 * (fail-closed), statt ungeprüfte Events zu verarbeiten.
 */
export function ds24IpnPassphrase(): string | null {
  return process.env.DIGISTORE_IPN_PASSPHRASE || null;
}

/**
 * userId des Betreibers — Eigentümer aller Bestellungen, Abos und Token-Konten.
 *
 * Der Betreiber ist der Benutzer mit `role = "owner"`; angelegt wird er per
 * `make user-create ARGS="--email … --role owner --apply"`. Gibt es mehrere,
 * gewinnt der älteste, damit die Zuordnung stabil bleibt.
 */
export async function getOwnerUserId(): Promise<string | null> {
  const owner = await db.query.users.findFirst({
    where: eq(users.role, "owner"),
    orderBy: [asc(users.createdAt)],
    columns: { id: true },
  });
  return owner?.id ?? null;
}
