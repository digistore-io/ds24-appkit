// Edge-sichere Auth-Konfiguration (KEIN DB-Import, KEIN nodemailer!).
// Wird vom Middleware (Edge-Runtime) UND vom vollen auth.ts genutzt.
//
// Hier stehen nur edge-sichere Provider. Der E-Mail-Magic-Link-Provider
// (Postmark/SMTP) wird in auth.ts (Node-Runtime) ergänzt — siehe lib/email.ts.
//   - E-Mail-Token-Login (Standard) → Postmark ODER SMTP (Setup: docs/auth-setup.md)
//   - Google OAuth (optional)        → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const providers: NextAuthConfig["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export default {
  providers,
  pages: { signIn: "/login" },
  // Sessions als JWT → Middleware kann am Edge ohne DB prüfen.
  session: { strategy: "jwt" },
  callbacks: {
    // Route-Schutz (greift zusammen mit dem Matcher in middleware.ts).
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      if (path.startsWith("/dashboard")) return Boolean(auth?.user);
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "member";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as string) ?? "member";
      }
      return session;
    },
  },
  // PaaS setzt den Host-Header dynamisch — verhindert den "untrusted host"-Fehler.
  trustHost: true,
} satisfies NextAuthConfig;
