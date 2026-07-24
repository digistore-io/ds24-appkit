// Enforcement of the account block.
//
// A block that only stops the next sign-in is not a block: this app's sessions
// are JWTs (auth.config.ts → session.strategy = "jwt"), and a JWT stays valid
// until it expires — even if the database has said "blocked" for a while.
// Anyone already signed in would stay in for weeks.
//
// So the check happens in TWO places:
//
//  1. on sign-in — the `signIn` callback in auth.ts. Prevents new sessions.
//  2. on every request to the protected area — app/dashboard/layout.tsx via
//     requireActiveUser() in lib/authz.ts. Ends running sessions.
//
// Why not in the proxy: it deliberately has no database access (see proxy.ts)
// and sees only the JWT. The check therefore costs one small query per
// dashboard page load — the price for a block that takes effect immediately
// instead of at the next sign-in.
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** What the database says about an account id. */
export type SignInVerdict = "blocked" | "allowed" | "unknown";

/**
 * May a sign-in proceed? PURE — the two lookups happen in the caller.
 *
 * The interesting case is `unknown`, and it is the reason this function
 * exists. `isUserBlocked()` treats an id with no row as blocked, which is
 * right for a RUNNING session — the account was deleted underneath it. At
 * SIGN-IN it is exactly wrong: Auth.js hands the callback a freshly minted id
 * for an account it is about to create, so "no row" means "about to exist".
 *
 * Treating that as blocked turns every first-ever sign-in into "account
 * blocked" — and it is invisible in development, where the dev login inserts
 * the row before the callback ever runs.
 *
 * For an account that does not exist yet, the address is what can carry a
 * block, so that is what decides.
 */
export function maySignIn(verdict: SignInVerdict, emailBlocked: boolean): boolean {
  if (verdict === "blocked") return false;
  if (verdict === "allowed") return true;
  return !emailBlocked;
}

/** Blocked, allowed, or no such account — one query, three answers. */
export async function signInVerdict(id: string): Promise<SignInVerdict> {
  const [row] = await db
    .select({ blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.id, id));
  if (!row) return "unknown";
  return row.blockedAt !== null ? "blocked" : "allowed";
}

/**
 * Is this account blocked? Unknown IDs count as blocked.
 *
 * For a RUNNING session (requireActiveUser). Do not use at sign-in — see
 * maySignIn() above for why.
 */
export async function isUserBlocked(id: string): Promise<boolean> {
  const [row] = await db
    .select({ blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.id, id));
  // No hit means the account was deleted while the session was running. That
  // access belongs terminated too — "not found" is not "may come in".
  if (!row) return true;
  return row.blockedAt !== null;
}

/**
 * Is the account for this address blocked? For the sign-in path, where (with a
 * magic link) only the address is known and there is no user ID yet.
 *
 * Unknown addresses are NOT blocked here: someone signing in for the first
 * time has no account yet — Auth.js is about to create it.
 */
export async function isEmailBlocked(email: string): Promise<boolean> {
  const [row] = await db
    .select({ blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  return row ? row.blockedAt !== null : false;
}
