// Role-based access control.
//
// The role lives in the session (see auth.config.ts → session.user.role).
// Convention (db/schema.ts): "owner" = SAAS operator (admin), "member" = customer.
//
// `proxy.ts` only guards "signed in vs. not" — the *role* check happens
// server-side in the individual page or route via requireOwner().
//
// The pure predicates (isOwner/hasRole/isRole) live in lib/roles.ts and are
// re-exported here — that way client components can import them too, without
// the bundler dragging in auth.ts (and with it the mail sending). requireOwner
// loads auth() at runtime (dynamic import); `redirect` stays static —
// next/navigation is lightweight and gives us the `never` type narrowing.
import { redirect } from "next/navigation";

// Role definitions and predicates live in lib/roles.ts (free of server
// dependencies, so client components can import them too) and are passed
// through here — server code then needs only one import.
export { ROLES, isRole, isOwner, hasRole } from "./roles";
export type { Role } from "./roles";
import { isOwner } from "./roles";

/**
 * The error parameter the sign-in page uses to show "this account is blocked".
 * Deliberately the same value Auth.js sets itself when the signIn callback
 * rejects a sign-in (auth.ts) — so both paths produce exactly one message
 * instead of two that say the same thing.
 */
export const ACCESS_DENIED = "AccessDenied";

/**
 * Guard for EVERY signed-in page.
 * - not signed in → redirect to /login
 * - blocked       → redirect to /login with the blocked message
 * Returns the session if access holds.
 *
 * The block check MUST happen here and not in the proxy: that one sees only
 * the JWT — which says nothing about the account having been blocked since —
 * and is kept free of the database on purpose. lib/users/blocked.ts explains
 * why this is necessary.
 */
export async function requireActiveUser() {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { isUserBlocked } = await import("@/lib/users/blocked");
  if (await isUserBlocked(session.user.id as string)) {
    redirect(`/login?error=${ACCESS_DENIED}`);
  }

  return session;
}

/**
 * Guard for operator/admin areas.
 * - not signed in → redirect to /login
 * - blocked       → redirect to /login with the blocked message
 * - not an owner  → redirect to /dashboard
 * Returns the session if the role fits.
 *
 * You could additionally gate path prefixes in auth.config.ts:authorized();
 * this is deliberately server-side so that role and block are checked fresh
 * against the database — the JWT would only hold the state from sign-in time.
 */
export async function requireOwner() {
  const session = await requireActiveUser();
  if (!isOwner(session.user.role)) redirect("/dashboard");
  return session;
}
