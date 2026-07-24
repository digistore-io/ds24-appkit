// Which Member does an incoming payment belong to?
//
// PURE — no database, no I/O. The lookups happen in lib/digistore/payment-event.ts
// and their results are handed in here. That split is the same one
// lib/users/rules.ts uses for the user-management rules, and for the same
// reason: this decision governs money, so it has to be testable one case at a
// time (attribution.test.ts). Nothing in this repo can test a DB-bound
// function — there is no test database.
//
// TRUST, and why the order of preference is not negotiable:
//
//   identity    the member id plus that member's checkout token, both written
//               by THIS APP and stored on the purchase by Digistore24.
//               Authenticated.
//   buyer email whatever the buyer typed into a Digistore24 form. Digistore24
//               does not verify they control it. NOT authenticated — anyone can
//               type anyone's address.
//
// So the reference always wins, and the email path is a fallback whose result
// must stay safe when the claim is a lie. Attribution only ever grants, never
// revokes, which is what makes the fallback tolerable at all.

import type { CustomValue } from "./custom";

/** Why attribution landed where it did. Internal — never shown to a person. */
export type AttributionReason =
  /** Resolved through the identity string. Authenticated. */
  | "identity"
  /** Matched exactly one Member by buyer email. Unauthenticated. */
  | "email"
  /** An identity string was present but named nobody, and no email match. */
  | "identityUnresolved"
  /** The buyer email matched several Members — refuse to guess. */
  | "ambiguous"
  /** Nothing to go on. An ordinary anonymous purchase. */
  | "none";

export interface AttributionInput {
  /** Parsed `tracking[custom]`, or null when absent/foreign. */
  parsed: CustomValue | null;
  /** Member named by the identity string, or null when it did not resolve. */
  identifiedMemberId: string | null;
  /**
   * Members whose email equals the buyer's. Capped at two by the caller:
   * "exactly one" is the only usable answer, and more than one must not
   * silently become the first.
   */
  emailMatches: string[];
}

export interface Attribution {
  memberId: string | null;
  reason: AttributionReason;
}

export function chooseAttribution(input: AttributionInput): Attribution {
  const { parsed, identifiedMemberId, emailMatches } = input;
  const hadIdentity = parsed?.kind === "identity";

  if (hadIdentity && identifiedMemberId) {
    return { memberId: identifiedMemberId, reason: "identity" };
  }

  if (emailMatches.length === 1) {
    return { memberId: emailMatches[0], reason: "email" };
  }

  if (emailMatches.length > 1) {
    return { memberId: null, reason: "ambiguous" };
  }

  // An identity that names nobody is a different event from no identity at
  // all: the Member was deleted, the token was rotated, or the payload came
  // from another installation. Worth its own log line.
  if (hadIdentity) return { memberId: null, reason: "identityUnresolved" };

  return { memberId: null, reason: "none" };
}

/**
 * May this payment be credited to a token balance?
 *
 * Pure so that AD-3 — *attribution precedes any credit* — is actually asserted
 * somewhere. Nothing in this repo can test a DB-bound function, so without
 * this predicate the rule would live only inside an `if` in the IPN handler
 * and a future edit re-adding a buyer-email fallback would pass the test run.
 *
 * `memberId` is the gate, NOT the buyer email. A payment identified by the
 * identity string but arriving without an email must still be credited — that
 * independence is the whole point of carrying identity.
 */
export function shouldCreditTokens(input: {
  packageKey: string | null;
  status: string | null;
  orderId: string | undefined;
  memberId: string | null;
}): boolean {
  return Boolean(
    input.packageKey &&
      input.status === "paid" &&
      input.orderId &&
      input.memberId,
  );
}
