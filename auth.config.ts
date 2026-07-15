// Edge-sichere Auth-Konfiguration (KEIN DB-Import!).
// Wird sowohl vom Middleware (Edge-Runtime) als auch vom vollen auth.ts genutzt.
//
// Provider werden abhängig von gesetzten Env-Variablen aktiviert:
//   - Google OAuth   → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   - E-Mail Magic-Link (Resend) → AUTH_RESEND_KEY / EMAIL_FROM
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

const providers: NextAuthConfig["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM,
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
      const requiresAuth =
        path.startsWith("/dashboard") || path.startsWith("/onboarding");
      if (requiresAuth) return Boolean(auth?.user);
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
