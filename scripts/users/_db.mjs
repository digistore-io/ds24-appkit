// Shared helpers for the user management scripts (plain Node ESM).
//
// Access to the same Postgres as the app — connection via DATABASE_URL
// (see db/index.ts). No need to import the TypeScript DB layer; the
// users table is stable (id, email, name, role).
import postgres from "postgres";
import "../lib/env.mjs";

/** Minimal flag parser: --key value  and  --flag (boolean). */
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

// Canonical roles (convention from db/schema.ts):
//   "owner"  = SAAS operator (admin)
//   "member" = regular customer
export const CANONICAL_ROLES = ["owner", "member"];

// Friendly aliases → canonical. That way both --role owner and --role admin
// work (member/user likewise), without mixing two vocabularies in the code.
const ROLE_ALIASES = { admin: "owner", user: "member" };

/**
 * Normalises a role input to a canonical role.
 * @returns "owner" | "member", or null for invalid input.
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

/** Reads DATABASE_URL or aborts with a clear message. */
export function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "ERROR: DATABASE_URL is not set. Locally: `docker compose up -d`\n" +
        "and set DATABASE_URL in .env (see .env.example).",
    );
    process.exit(2);
  }
  return url;
}

/** Opens a short-lived Postgres connection (max 1) for a script. */
export function connect() {
  return postgres(requireDatabaseUrl(), { max: 1 });
}
