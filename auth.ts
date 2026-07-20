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
import { buildDevLoginProvider } from "@/lib/auth/dev-login";

const emailProvider = buildEmailProvider();
// Entwicklungs-Login: nur lokal und nur solange KEIN Mailversand eingerichtet
// ist (die Bedingungen stehen in lib/auth/dev-login.ts und sind dort getestet).
const devLoginProvider = buildDevLoginProvider();

const providers = [
  ...authConfig.providers,
  ...(emailProvider ? [emailProvider] : []),
  ...(devLoginProvider ? [devLoginProvider] : []),
];

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
