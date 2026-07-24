// Route protection in front of the app — up to Next.js 15 this file was called
// `middleware.ts`; since 16 the convention is `proxy.ts`.
//
// It uses ONLY the edge-safe auth.config (no database import). Since Next 16
// the proxy runs in the Node runtime, so that is no longer a hard requirement
// — but it stays that way on purpose: auth.config.ts is shared with the real
// auth.ts, and a Postgres import here would put the whole database layer in
// front of every request.
//
// What it can and cannot do is unchanged: it sees the JWT, not the database. A
// blocked user therefore stays signed in until `requireActiveUser()` in
// app/dashboard/layout.tsx throws them out — see lib/users/blocked.ts.
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Deliberately in two steps: Next.js reads this export statically, and a
// destructured `export const { auth: proxy } = …` is not recognized as a
// function — the build then fails with "must export a function".
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Everything NOT matched below is PUBLIC. Add new protected areas here.
  // Staying public by design: home page, login, auth routes, /plans, opt-in,
  // IPN webhook.
  matcher: ["/dashboard/:path*"],
};
