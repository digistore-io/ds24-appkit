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

/**
 * Where an attempt came from, for the origin-keyed rate limit.
 *
 * `x-forwarded-for` is a header, so it is whatever the sender wrote — trusting
 * it blindly would let an attacker mint a fresh identity per request and defeat
 * the very limit it feeds. It is used anyway, and here is why that is sound:
 * the app runs behind a proxy that OVERWRITES it (Railway, Render, Fly all do),
 * so the value that arrives is the proxy's, not the client's. Only the FIRST
 * entry is taken — the leftmost is the original client, and anything appended
 * after it is noise a client could have supplied.
 *
 * The failure mode if an operator does put this app on the open internet
 * without a proxy: the limit becomes forgeable and stops helping. It never
 * becomes a way IN — no decision here grants anything, it only withholds.
 */
function originOf(request: unknown): string | null {
  const headers = (request as { headers?: Headers } | undefined)?.headers;
  if (!headers || typeof headers.get !== "function") return null;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip")?.trim() || null;
}

export function buildPasswordProvider(): Provider {
  return Credentials({
    id: "password",
    name: "Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const email = String(credentials?.email ?? "");
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      // Loaded at runtime, as the development login does — keeps the database
      // out of any bundle that only needs the provider's shape.
      const { verifyPasswordLogin } = await import("@/lib/credentials/manage");

      const result = await verifyPasswordLogin(
        email,
        password,
        originOf(request),
      );
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
