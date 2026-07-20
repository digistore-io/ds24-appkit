// Datenbank-Schema (Drizzle ORM / Postgres).
//
// Enthält:
//  - Auth.js-Tabellen (users, accounts, sessions, verificationTokens) für den
//    @auth/drizzle-adapter.
//  - Digistore-Tabellen (orders, subscriptions, …) — siehe schema-digistore.ts,
//    das hier re-exportiert wird, damit `drizzle-kit` alles in einer Schema-Datei sieht.
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";

// --- Auth.js Kern-Tabellen ---------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Rolle für einfache Autorisierung (z. B. "owner" = SAAS-Betreiber).
  // Kanonische Werte: "owner" (Admin) | "member" (Kunde) — siehe lib/authz.ts.
  role: text("role").notNull().default("member"),
  // Anlagedatum — wird in der Benutzerverwaltung angezeigt.
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// --- Digistore-Tabellen ------------------------------------------------------
// In eigener Datei gehalten (Domänen-Trennung), hier re-exportiert.
export * from "./schema-digistore";

// --- Abrechnungs-Modelle (Abos + Prepaid-Token) ------------------------------
// Subscriptions (Abo-Verwaltung) + Token-Guthaben/-Journal für
// verbrauchsbasierte Abrechnung. Siehe schema-tokens.ts.
export * from "./schema-tokens";
