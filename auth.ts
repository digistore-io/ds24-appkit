// Voller Auth.js-Setup (Node-Runtime) — mit DB-Adapter.
// Basiert auf der edge-sicheren auth.config.ts und ergänzt den Drizzle-Adapter,
// der Nutzer, OAuth-Accounts und E-Mail-Verifikationstokens persistiert.
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import authConfig from "@/auth.config";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  ...authConfig,
});

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
  }
}
