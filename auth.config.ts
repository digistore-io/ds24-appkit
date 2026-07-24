// Slim auth configuration (NO database import, NO nodemailer!).
// Used by proxy.ts (route protection) AND by the full auth.ts.
//
// Since Next 16 the proxy runs in the Node runtime, so this file no longer
// HAS to be edge-safe — it stays that way anyway: it sits in front of every
// matched request, and a database or mail dependency has no business there.
// Only such providers live here. The email magic-link provider
// (Postmark/SMTP) is added in auth.ts (Node runtime) — see lib/email.ts.
//   - email token sign-in (default) → Postmark OR SMTP (setup: docs/auth-setup.md)
//   - Google OAuth (optional)       → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { devCookies } from "@/lib/auth/cookie-names";

const providers: NextAuthConfig["providers"] = [];

// Custom cookie names locally, so two apps on localhost do not overwrite each
// other's session (see lib/auth/cookie-names.ts).
// Outside of DEV: undefined — then the Auth.js defaults apply.
const cookies = devCookies({
  APP_ENV: process.env.APP_ENV,
  APP_URL: process.env.APP_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
});

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
  // Locally the fingerprinted names, elsewhere `undefined` — then Auth.js
  // keeps its own defaults. This line is the whole point of the exercise: as
  // long as it was missing, the names above were computed and thrown away.
  cookies,
  // `error: "/login"` redirects the built-in Auth.js error page to our own
  // sign-in page. Without it, a rejected sign-in (e.g. blocked account →
  // AccessDenied) lands on /api/auth/error — a bare, single-language page with
  // no way back. This way the error arrives as `?error=…` and is shown where
  // you can try again.
  pages: { signIn: "/login", error: "/login" },
  // Sessions as JWTs → the proxy can check without touching the database.
  session: { strategy: "jwt" },
  callbacks: {
    // Route protection (works together with the matcher in proxy.ts).
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
  // PaaS platforms set the Host header dynamically — prevents the
  // "untrusted host" error.
  trustHost: true,
} satisfies NextAuthConfig;
