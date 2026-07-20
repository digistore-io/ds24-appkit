// Gemeinsame Helfer für die Benutzer-Verwaltungs-Skripte (reines Node ESM).
//
// Zugriff auf dieselbe Postgres wie die App — Verbindung über DATABASE_URL
// (siehe db/index.ts). Kein Import der TypeScript-DB-Schicht nötig; die
// users-Tabelle ist stabil (id, email, name, role).
import postgres from "postgres";
import "../lib/env.mjs";

/** Minimaler Flag-Parser: --key value  und  --flag (boolean). */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// Kanonische Rollen (Konvention aus db/schema.ts):
//   "owner"  = SAAS-Betreiber (Admin)
//   "member" = normaler Kunde
export const CANONICAL_ROLES = ["owner", "member"];

// Freundliche Aliase → kanonisch. So funktioniert sowohl --role owner als auch
// --role admin (bzw. member/user), ohne zwei Vokabulare im Code zu vermischen.
const ROLE_ALIASES = { admin: "owner", user: "member" };

/**
 * Normalisiert eine Rollen-Eingabe auf eine kanonische Rolle.
 * @returns "owner" | "member" oder null bei ungültiger Eingabe.
 */
export function resolveRole(input) {
  if (input == null || input === true) return null;
  const v = String(input).trim().toLowerCase();
  if (CANONICAL_ROLES.includes(v)) return v;
  if (Object.prototype.hasOwnProperty.call(ROLE_ALIASES, v)) {
    return ROLE_ALIASES[v];
  }
  return null;
}

/** Liest DATABASE_URL oder bricht mit klarer Meldung ab. */
export function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "FEHLER: DATABASE_URL ist nicht gesetzt. Lokal: `docker compose up -d`\n" +
        "und DATABASE_URL in .env setzen (siehe .env.example).",
    );
    process.exit(2);
  }
  return url;
}

/** Öffnet eine kurzlebige Postgres-Verbindung (max 1) für ein Skript. */
export function connect() {
  return postgres(requireDatabaseUrl(), { max: 1 });
}
