// The imperative shell for the optional password: it owns the database writes
// and calls the pure rules (rules.ts) before making any of them.
//
// Everything here acts on ONE account — the one that asked. No function takes
// an account id from a form; the caller passes the id it read from the session
// itself. A Member managing their own credentials is the only use case, and
// widening it later should require deleting this sentence first.
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/credentials/hash";
import {
  CredentialError,
  canChangePassword,
  checkNewPassword,
  isLockedOut,
  recentAttempts,
} from "@/lib/credentials/rules";

export interface SignInState {
  /** The account's address as the DATABASE holds it — see below. */
  email: string | null;
  hasPassword: boolean;
}

/**
 * How this account is signed into: the address, and whether a password exists.
 * Never returns the hash itself.
 *
 * ⛔ The address comes from the database and NOT from the session, and that is
 * not interchangeable here. Sessions are JWTs (auth.config.ts): the email in one
 * is the email at the moment of sign-in, so a Member who has just confirmed an
 * address change would be shown their OLD address by the very page that just
 * changed it. The sidebar still shows the cached one until the next sign-in —
 * a cosmetic lag, and it corrects itself. Being wrong HERE would not be
 * cosmetic; it is the page somebody opens to check what their address is.
 */
export async function signInState(userId: string): Promise<SignInState> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new CredentialError("credentialUserNotFound");
  return { email: row.email, hasPassword: Boolean(row.passwordHash) };
}

/**
 * Sets or replaces the password on the caller's own account.
 *
 * `current` is required exactly when one is already set. Setting a FIRST
 * password rests on the session alone — there is no older secret to ask for.
 */
export async function setPassword(
  userId: string,
  input: { password: string; confirmation: string; current?: string },
): Promise<{ email: string | null; created: boolean }> {
  const denial = checkNewPassword(input.password, input.confirmation);
  if (denial) throw new CredentialError(denial);

  const [row] = await db
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new CredentialError("credentialUserNotFound");

  if (row.passwordHash) {
    const ok = await verifyPassword(input.current ?? "", row.passwordHash);
    if (!ok) throw new CredentialError("passwordWrong");
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.password) })
    .where(eq(users.id, userId));

  // A changed password is a good moment to forget old failures: the guesses
  // that accumulated were against a secret that no longer exists.
  clearAttempts(row.email);

  // Returned so the delivery layer can tell the Member what happened. WHICH of
  // the two it was comes from the database rather than from the form — the
  // notice must describe what actually occurred.
  return { email: row.email, created: !row.passwordHash };
}

/**
 * Removes the password from the caller's own account. Magic-link sign-in is
 * unaffected and remains available, which is what makes this safe to offer:
 * the account never ends up with no way in.
 *
 * Not account closure, and nothing else changes — not the address, not the
 * session, not the balance, not access.
 */
export async function removePassword(
  userId: string,
  input: { current: string },
): Promise<{ email: string | null }> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new CredentialError("credentialUserNotFound");

  const denial = canChangePassword({ hasPassword: Boolean(row.passwordHash) });
  if (denial) throw new CredentialError(denial);

  const ok = await verifyPassword(input.current, row.passwordHash);
  if (!ok) throw new CredentialError("passwordWrong");

  await db
    .update(users)
    .set({ passwordHash: null })
    .where(eq(users.id, userId));

  clearAttempts(row.email);

  return { email: row.email };
}

// --- Sign-in -----------------------------------------------------------------

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

/**
 * The password sign-in check, for the Credentials provider in
 * lib/auth/password-login.ts.
 *
 * Answers with the account or with null, and never says WHY — not to the
 * caller and not through how long it took. "No such account", "no password
 * set", "wrong password" and "blocked" are one answer, because any difference
 * between them tells a stranger which addresses have accounts here.
 *
 * The one exception is deliberate: too many failures is reported as such, via
 * `RateLimited`. A silent refusal there would leave the real owner locking
 * themselves out with no idea why.
 */
export type SignInResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; rateLimited: boolean };

export async function verifyPasswordLogin(
  email: string,
  password: string,
): Promise<SignInResult> {
  const key = email.trim().toLowerCase();
  if (isRateLimited(key)) return { ok: false, rateLimited: true };

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      blockedAt: users.blockedAt,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, key));

  // verifyPassword spends its time even when there is nothing to compare
  // against, so an unknown address costs the same as a known one.
  const matches = await verifyPassword(password, row?.passwordHash ?? null);

  // The block is checked HERE as well as in the signIn callback in auth.ts.
  // Two independent gates on purpose: this provider returns a user object
  // straight into Auth.js, and a future refactor of that callback must not be
  // able to quietly open a door for blocked accounts.
  if (!row || !matches || row.blockedAt) {
    recordFailedAttempt(key);
    return { ok: false, rateLimited: false };
  }

  clearAttempts(key);
  return {
    ok: true,
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
  };
}

// --- Failed-attempt bookkeeping ----------------------------------------------
//
// In memory, per process, on purpose — and worth knowing precisely rather than
// discovering later. The template ships as a single Node process, so one Map is
// the whole picture. Run several instances behind a load balancer and each
// keeps its own count, which multiplies the effective limit by the number of
// instances. That is a real limitation, not an oversight: a shared store means
// Redis or a table on the sign-in path, and neither belongs in a template that
// promises no new runtime dependency. Revisit when the app is scaled out.
const attempts = new Map<string, number[]>();

/** Keeps the Map from growing without bound on a long-running process. */
const MAX_TRACKED_KEYS = 10_000;

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  return isLockedOut(attempts.get(key) ?? [], now);
}

export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  const kept = recentAttempts(attempts.get(key) ?? [], now);
  kept.push(now);
  attempts.set(key, kept);

  if (attempts.size > MAX_TRACKED_KEYS) {
    for (const [k, timestamps] of attempts) {
      if (recentAttempts(timestamps, now).length === 0) attempts.delete(k);
    }
  }
}

export function clearAttempts(key: string | null): void {
  if (key) attempts.delete(key.trim().toLowerCase());
}

/** Test seam — drops all recorded failures. */
export function resetAttempts(): void {
  attempts.clear();
}
