// Voller Auth.js-Setup (Node-Runtime) — mit DB-Adapter.
// Basiert auf der edge-sicheren auth.config.ts und ergänzt den Drizzle-Adapter
// (Nutzer, OAuth-Accounts, E-Mail-Verifikationstokens) sowie den E-Mail-Magic-
// Link-Provider (Postmark/SMTP), der nur in der Node-Runtime laufen darf.
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import authConfig from "@/auth.config";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { buildEmailProvider } from "@/lib/email";

const emailProvider = buildEmailProvider();
const providers = emailProvider
  ? [...authConfig.providers, emailProvider]
  : authConfig.providers;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
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
