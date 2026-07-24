// Token rules — deliberately PURE functions, no database.
//
// Why they are separate: an Operator correcting a balance by hand moves
// customer money. The decision therefore has to be testable one by one
// (lib/tokens/rules.test.ts), and there is no test database in this project —
// so the decision lives here, and the database layer (lib/tokens/account.ts)
// becomes transcription.
//
// LANGUAGE: this layer returns NO finished sentences, only codes
// (`"insufficientBalance"`). Translation happens in the server action via the
// `errors` namespace in `messages/*.json`. A sentence written here would exist
// in exactly one language — and not necessarily the Operator's.
import type { Actor } from "@/lib/users/rules";

/**
 * The largest value `token_ledger.amount` and `.balance_after` can hold: both
 * are Postgres `integer` (signed 32-bit). Past this the INSERT raises a
 * database error the Operator reads as "unknown error", which is why the
 * refusal happens here, with a translated reason.
 */
export const MAX_TOKEN_AMOUNT = 2_147_483_647;

/**
 * Every reason an adjustment is refused. Each code MUST have a text in
 * `messages/*.json` under `errors` — `i18n/messages.test.ts` enforces that, and
 * it walks THIS list as well as USER_ERROR_CODES.
 */
export const TOKEN_ERROR_CODES = [
  "notOwner",
  "emptyReason",
  "invalidReason",
  "invalidAmount",
  "zeroAmount",
  "amountTooLarge",
  "insufficientBalance",
] as const;

export type TokenErrorCode = (typeof TOKEN_ERROR_CODES)[number];

/**
 * An error carrying a translatable reason. The server action catches it and
 * turns it into a message in the Operator's language via `t(code)` — the same
 * contract as `UserError` in lib/users/rules.ts.
 */
export class TokenError extends Error {
  readonly code: TokenErrorCode;

  constructor(code: TokenErrorCode) {
    // The message IS the code — it belongs in logs, not in front of people.
    super(code);
    this.name = "TokenError";
    this.code = code;
  }
}

/** What an accepted adjustment amounts to. */
export interface AdjustmentPlan {
  ok: true;
  /** Signed: + credits the Member, − takes tokens away. */
  delta: number;
  /** The reason, trimmed — this is what lands in `token_ledger.note`. */
  reason: string;
  /** The balance the account will hold afterwards. */
  balanceAfter: number;
}

export type AdjustmentDecision = AdjustmentPlan | { ok: false; code: TokenErrorCode };

/**
 * Reads a whole number out of raw form input.
 *
 * Deliberately a regex and not `Number()` or `parseInt()`. Every convenient
 * parser lies about one of the inputs a form actually produces:
 *
 *   Number("")          -> 0      (an empty field would book nothing, silently)
 *   Number("abc")       -> NaN    (has to be caught anyway)
 *   Number("1e3")       -> 1000   (nobody typed a thousand)
 *   parseInt("5 tokens")-> 5      (reads a typo as an amount)
 *
 * Returns null for anything that is not an unambiguous integer.
 */
function parseWholeNumber(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isInteger(input) ? input : null;
  }
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  // A string of 30 digits passes the regex and lands past Number.MAX_SAFE_INTEGER.
  // It is caught by the range check in decideAdjustment, but only if it is a
  // finite number at all.
  return Number.isFinite(value) ? value : null;
}

/**
 * The whole decision behind "the Operator corrects a token balance".
 *
 * Both the mandatory reason and the over-withdrawal rule live in this one
 * function on purpose: both have to be re-evaluated against the balance that
 * was LOCKED inside the transaction (lib/tokens/account.ts → adjustTokens),
 * and a rule evaluated in two places is a rule that will disagree with itself.
 *
 * `balanceAfter` is returned rather than recomputed by the caller, so "the
 * ledger records the resulting balance" is testable without a database.
 *
 * There is NO self-guard. An Operator may correct their own balance — unlike
 * deleting, demoting or blocking themselves, doing so locks nobody out and
 * leaves the same journal entry as any other correction.
 *
 * @param input.balance the CURRENT balance, read `FOR UPDATE`
 * @param input.amount  raw FormData — a string, or missing entirely
 * @param input.reason  raw FormData — the note the correction is explained by
 */
export function decideAdjustment(input: {
  actor: Actor;
  balance: number;
  amount: unknown;
  reason: unknown;
}): AdjustmentDecision {
  // Authorization first. Someone who may not act must not learn from the
  // message whether their amount would have been accepted.
  if (input.actor.role !== "owner") return { ok: false, code: "notOwner" };

  // AC 2 — and this, not the form's `required` attribute, is the refusal: a
  // server action is an HTTP endpoint of its own and can be called without the
  // form ever having been rendered.
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  // Empty is the obvious case. The others are not: `trim()` does NOT strip a
  // zero-width space, a braille blank or a zero-width joiner, so "\u200B"
  // passes as a reason and the journal then asserts that a reason was given
  // while showing an empty cell — and because `note` is non-null, even the
  // "—" placeholder does not appear. This note is the only record of why money
  // moved, so it has to contain something a person can read.
  //
  // (A BOM is fine to ignore — `trim()` does strip that one.)
  if (reason === "" || !/[\p{L}\p{N}]/u.test(reason)) {
    return { ok: false, code: "emptyReason" };
  }
  // A control character — NUL above all — is accepted by JS and REJECTED by
  // Postgres, which surfaces to the Operator as "unknown error" rather than
  // the translated refusal AC 4 promises. The length bound is the same idea:
  // an unbounded note is pulled into every render of the journal.
  if (reason.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(reason)) {
    return { ok: false, code: "invalidReason" };
  }

  const delta = parseWholeNumber(input.amount);
  if (delta === null) return { ok: false, code: "invalidAmount" };
  // `-0 === 0` is true, so this catches "-0" as well.
  if (delta === 0) return { ok: false, code: "zeroAmount" };
  if (Math.abs(delta) > MAX_TOKEN_AMOUNT) {
    return { ok: false, code: "amountTooLarge" };
  }

  const balanceAfter = input.balance + delta;

  // The amount fits but the RESULT does not — the row that would raise the
  // database error is the ledger row, not the input field.
  if (balanceAfter > MAX_TOKEN_AMOUNT) {
    return { ok: false, code: "amountTooLarge" };
  }

  // AC 3. Written as `balanceAfter < 0` and NOT as
  // `hasSufficientBalance(balance, delta)`: that helper answers false for a
  // negative `cost` (account.ts), so fed the signed delta it would refuse a
  // legitimate credit of 150 onto a balance of 100.
  if (balanceAfter < 0) return { ok: false, code: "insufficientBalance" };

  return { ok: true, delta, reason, balanceAfter };
}
