// Database schema (Drizzle ORM / Postgres).
//
// Contains:
//  - the Auth.js tables (users, accounts, sessions, verificationTokens) for the
//    @auth/drizzle-adapter.
//  - the Digistore tables (orders, subscriptions, …) — see schema-digistore.ts,
//    which is re-exported here so `drizzle-kit` sees everything in one schema file.
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";

// --- Auth.js core tables -----------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Role for simple authorization (e.g. "owner" = SAAS operator).
  // Canonical values: "owner" (admin) | "member" (customer) — see lib/authz.ts.
  role: text("role").notNull().default("member"),
  // Creation date — shown in the user management screen.
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // Corroborates this member's id inside the Digistore24 `tracking[custom]`
  // value (see lib/digistore/custom.ts). 10 random alphanumerics, handed out on
  // the first checkout rather than at sign-up — five different code paths
  // create users, and a backfill would miss whichever is added next.
  //
  // NOT a credential: it never authenticates a session. It only makes a member
  // id insufficient on its own inside a value the server alone writes.
  checkoutToken: text("checkoutToken").unique(),
  // Blocked since — NULL means "not blocked". Deliberately a timestamp rather
  // than a yes/no: this way the database also records SINCE WHEN someone has
  // had no access. How the block is enforced: see lib/users/blocked.ts.
  blockedAt: timestamp("blockedAt", { mode: "date" }),
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

// --- Digistore tables --------------------------------------------------------
// Kept in a file of their own (domain separation), re-exported here.
export * from "./schema-digistore";

// --- Billing models (subscriptions + prepaid tokens) -------------------------
// Subscriptions plus token balance/ledger for usage-based billing.
// See schema-tokens.ts.
export * from "./schema-tokens";

// --- Entitlements ------------------------------------------------------------
// `grants` — the app's own answer to "may this person use this". The one table
// an access question touches. See schema-entitlements.ts.
export * from "./schema-entitlements";
