// User management rules — deliberately PURE functions, no database.
//
// Why they are separate: these rules keep an operator from locking themselves
// out, or from leaving the app without an admin. That makes them
// security-relevant, and they have to be testable one by one
// (lib/users/rules.test.ts).
//
// The database layer (lib/users/manage.ts) calls them BEFORE it writes.
//
// LANGUAGE: this layer returns NO finished sentences, only codes
// (`"selfDelete"`). Translation happens in the UI via the `errors` namespace
// in `messages/*.json`. A sentence written here would exist in exactly one
// language — and that would not necessarily be the user's.
import type { Role } from "@/lib/roles";

/** The admin performing the action. */
export interface Actor {
  id: string;
  role: string;
}

/** The user being acted upon. */
export interface Target {
  id: string;
  role: string;
  /** Blocked since — null/undefined means "not blocked". */
  blockedAt?: Date | null;
  email?: string | null;
}

/**
 * Every reason for refusal. Each code MUST have a text in `messages/*.json`
 * under `errors` — `i18n/messages.test.ts` enforces that.
 */
export const USER_ERROR_CODES = [
  "notOwner",
  "selfDelete",
  "lastOwnerDelete",
  "selfDemote",
  "lastOwnerRole",
  "selfBlock",
  "lastOwnerBlock",
  "invalidEmail",
  "emailTaken",
  "userNotFound",
  "userBlocked",
  "userWithoutEmail",
  "emailNotConfigured",
] as const;

export type UserErrorCode = (typeof USER_ERROR_CODES)[number];

/** Result of a check. `null` = allowed, otherwise the reason. */
export type Denial = UserErrorCode | null;

/**
 * An error carrying a translatable reason. The server actions catch it and
 * turn it into a message in the user's language via `t(code)`.
 */
export class UserError extends Error {
  readonly code: UserErrorCode;

  constructor(code: UserErrorCode) {
    // The message IS the code — it belongs in logs, not in front of people.
    super(code);
    this.name = "UserError";
    this.code = code;
  }
}

/**
 * May `actor` delete the user `target`?
 *
 * Forbidden:
 *  - not being an admin,
 *  - deleting yourself (you would lock yourself out),
 *  - deleting the last remaining admin (nobody could get back in).
 */
export function canDeleteUser(
  actor: Actor,
  target: Target,
  ownerCount: number,
): Denial {
  if (actor.role !== "owner") return "notOwner";
  if (actor.id === target.id) return "selfDelete";
  if (target.role === "owner" && ownerCount <= 1) return "lastOwnerDelete";
  return null;
}

/**
 * May `actor` set `target`'s role to `newRole`?
 *
 * Forbidden:
 *  - not being an admin,
 *  - demoting yourself (you would lose access immediately),
 *  - turning the last admin into a plain user.
 *
 * Setting the role that already applies is allowed — and deliberately a no-op.
 */
export function canChangeRole(
  actor: Actor,
  target: Target,
  newRole: Role,
  ownerCount: number,
): Denial {
  if (actor.role !== "owner") return "notOwner";
  if (target.role === newRole) return null;
  if (actor.id === target.id && newRole !== "owner") return "selfDemote";
  if (target.role === "owner" && newRole !== "owner" && ownerCount <= 1)
    return "lastOwnerRole";
  return null;
}

/** May `actor` create users at all? */
export function canCreateUser(actor: Actor): Denial {
  if (actor.role !== "owner") return "notOwner";
  return null;
}

/**
 * May `actor` block or unblock the user `target`?
 *
 * Blocking means: no new sign-in, and the running session ends on the next
 * page load (lib/users/blocked.ts). That makes it almost as drastic as
 * deleting — only reversible. Hence the same safeguards:
 *  - not being an admin,
 *  - blocking yourself (you could not get back in to lift it),
 *  - blocking the last remaining admin.
 *
 * UNBLOCKING is always allowed: it grants nobody rights they did not already
 * have, and a state you cannot get out of would be a trap.
 */
export function canBlockUser(
  actor: Actor,
  target: Target,
  ownerCount: number,
  blocked: boolean,
): Denial {
  if (actor.role !== "owner") return "notOwner";
  if (!blocked) return null;
  if (actor.id === target.id) return "selfBlock";
  if (target.role === "owner" && ownerCount <= 1) return "lastOwnerBlock";
  return null;
}

/**
 * May `actor` change `target`'s email address?
 *
 * In this app the address IS the identity — it is where the sign-in link goes.
 * Changing it therefore means: whoever held the old address can no longer get
 * in, and whoever holds the new one can. Only admins may do that.
 *
 * Whether the address itself is usable and still free is decided by the
 * database layer (normalizeEmail, or the unique index → "emailTaken").
 */
export function canChangeEmail(actor: Actor): Denial {
  if (actor.role !== "owner") return "notOwner";
  return null;
}

/**
 * May `actor` send the user `target` a sign-in link?
 *
 * Forbidden:
 *  - not being an admin,
 *  - an account without an email address (there would be nowhere to send it),
 *  - a blocked account — a link that leads nowhere only confuses.
 */
export function canSendLoginLink(actor: Actor, target: Target): Denial {
  if (actor.role !== "owner") return "notOwner";
  if (!target.email) return "userWithoutEmail";
  if (target.blockedAt) return "userBlocked";
  return null;
}

/**
 * The longest address this app will accept — the limit RFC 5321 puts on a
 * forward path, so nothing deliverable is turned away.
 *
 * It is a security bound rather than a formatting one. `users.email` and
 * `email_changes.newEmail` are unbounded `text`, and an address also becomes a
 * key in the in-memory rate-limit map (lib/rate-limit.ts). Without a cap, a
 * signed-in Member can hand the server a megabyte per request and have it
 * stored and retained; the pattern that matched before this line accepted a
 * 200,000-character address in a millisecond.
 */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Normalizes and validates an email input.
 * @returns the trimmed, lowercased address, or null if it is unusable.
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  // Checked before the pattern, and on the RAW input: the point is to refuse
  // absurd input cheaply, not to measure it after work has been done on it.
  if (input.length > MAX_EMAIL_LENGTH) return null;
  const email = input.trim().toLowerCase();
  // Deliberately simple: one character before and after the @, a dot in the domain.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
