// Password sign-in — the optional second door.
//
// Unlike the development login next to it (lib/auth/dev-login.ts), this is NOT
// a bypass and is not restricted to any environment. It authenticates a real
// secret that the account's owner set on themselves, and it exists in DEV,
// STAGING and PROD alike.
//
// Three things it deliberately does NOT do:
//
//   1. It never creates an account. The magic link and OAuth do that (via the
//      adapter in auth.ts); a sign-in path that creates users from a password
//      would let anyone mint accounts at any address they can spell.
//   2. It never says why it refused. Wrong password, no password set, no such
//      account and blocked are one answer — see verifyPasswordLogin().
//   3. It never bypasses the block. The check runs here AND in the signIn
//      callback in auth.ts, on purpose.
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

export function buildPasswordProvider(): Provider {
  return Credentials({
    id: "password",
    name: "Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email ?? "");
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      // Loaded at runtime, as the development login does — keeps the database
      // out of any bundle that only needs the provider's shape.
      const { verifyPasswordLogin } = await import("@/lib/credentials/manage");

      const result = await verifyPasswordLogin(email, password);
      if (!result.ok) {
        // Both "wrong" and "too many attempts" return null. Auth.js turns that
        // into one error on /login, and the message there covers both cases in
        // one sentence rather than telling a stranger which one they hit.
        return null;
      }
      return result.user;
    },
  });
}
