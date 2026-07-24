// Rules for the optional password — deliberately PURE functions, no database
// and no crypto.
//
// Why they are separate: these decide whether a credential may be set at all
// and when an attacker has had too many guesses. That makes them
// security-relevant, and they have to be testable one by one
// (lib/credentials/rules.test.ts).
//
// The shell (lib/credentials/manage.ts) calls them BEFORE it writes.
//
// LANGUAGE: this layer returns NO finished sentences, only codes
// ("passwordTooShort"). Translation happens in the UI via the `errors`
// namespace in `messages/*.json`. A sentence written here would exist in
// exactly one language — and that would not necessarily be the user's.

/**
 * Every reason for refusal. Each code MUST have a text in `messages/*.json`
 * under `errors` — `i18n/messages.test.ts` enforces that, and this union is
 * registered there.
 */
export const CREDENTIAL_ERROR_CODES = [
  "passwordTooShort",
  "passwordTooLong",
  "passwordMismatch",
  "passwordWrong",
  "noPasswordSet",
  "tooManyAttempts",
  "credentialUserNotFound",
] as const;

export type CredentialErrorCode = (typeof CREDENTIAL_ERROR_CODES)[number];

/** Result of a check. `null` = allowed, otherwise the reason. */
export type Denial = CredentialErrorCode | null;

/**
 * An error carrying a translatable reason. The server actions catch it and
 * turn it into a message in the user's language via `t(code)`.
 */
export class CredentialError extends Error {
  readonly code: CredentialErrorCode;

  constructor(code: CredentialErrorCode) {
    // The message IS the code — it belongs in logs, not in front of people.
    super(code);
    this.name = "CredentialError";
    this.code = code;
  }
}

/**
 * Minimum length, counted in CODE POINTS rather than UTF-16 units, so that a
 * passphrase made of emoji or CJK characters is measured the way its author
 * sees it — "🔑🔑🔑🔑🔑" is five characters, not ten.
 *
 * Ten, and no composition rules. Length beats composition: a required digit,
 * capital and symbol pushes people toward one predictable shape ("Passwort1!")
 * and toward writing the result down. Current public guidance has advised
 * against composition rules for years, and this app has no reason to differ.
 */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * Upper bound. Not a security rule — scrypt does not care — but an unbounded
 * input to a deliberately slow function is a cheap way to make the server work
 * hard for nothing. Far above any password a person types.
 */
export const MAX_PASSWORD_LENGTH = 200;

/** Length in code points. `"🔑".length` is 2; this counts it as 1. */
export function passwordLength(password: string): number {
  return [...password].length;
}

/**
 * May this become somebody's password?
 *
 * Deliberately NOT trimmed: a leading or trailing space is a legitimate part
 * of a password, and silently removing one would mean the password that gets
 * stored is not the password that was typed — which surfaces later as "it
 * worked yesterday".
 */
export function checkNewPassword(password: string, confirmation: string): Denial {
  const length = passwordLength(password);
  if (length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  if (length > MAX_PASSWORD_LENGTH) return "passwordTooLong";
  if (password !== confirmation) return "passwordMismatch";
  return null;
}

/** May this account's password be changed or removed? */
export function canChangePassword(state: { hasPassword: boolean }): Denial {
  return state.hasPassword ? null : "noPasswordSet";
}

// --- Rate limiting -----------------------------------------------------------
//
// A magic link is protected by the attacker having to read somebody else's
// mail. A password is protected by nothing except the number of guesses it
// allows. Without this limit, adding a password to this app would make it LESS
// safe than it was.
//
// The mechanism lives in lib/rate-limit.ts — shared with the change-address
// mails, which are the other thing here a stranger can trigger repeatedly. Only
// the numbers are decided in this file.

import type { Limit } from "@/lib/rate-limit";

/** How long failures are remembered. */
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/** Failures tolerated inside that window before sign-in is refused. */
export const MAX_ATTEMPTS = 10;

/**
 * Ten guesses per quarter hour, per address.
 *
 * Generous on purpose: the person who most often gets a password wrong ten
 * times is the one who owns the account. It is nowhere near enough to search a
 * password of the minimum length above, and the window slides, so waiting is
 * always a way back in.
 */
export const SIGN_IN_LIMIT: Limit = {
  max: MAX_ATTEMPTS,
  windowMs: ATTEMPT_WINDOW_MS,
};

/** The bucket these hits are counted in. */
export const SIGN_IN_BUCKET = "password-sign-in";
