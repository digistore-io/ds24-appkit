import { describe, it, expect } from "vitest";
import {
  chooseAttribution,
  shouldArmAutoReload,
  shouldCreditTokens,
} from "./attribution";
import { parseCustom, buildIdentity } from "./custom";

const UUID = "9f3c1b7e-5d21-4a88-b0c4-2e6f7a1d9c30";
const TOKEN = "a7Kd2Pq9Zx";
const IDENTITY = buildIdentity({ memberId: UUID, checkoutToken: TOKEN, productKey: "pro" });
const MEMBER = "member-1";
const OTHER = "member-2";

describe("chooseAttribution", () => {
  it("prefers the identity string over the buyer email", () => {
    // The whole reason the reference exists: the buyer may pay under an
    // address the app has never seen, or one belonging to somebody else.
    const result = chooseAttribution({
      parsed: parseCustom(IDENTITY),
      identifiedMemberId: MEMBER,
      emailMatches: [OTHER],
    });
    expect(result).toEqual({ memberId: MEMBER, reason: "identity" });
  });

  it("falls back to the buyer email when there is no identity", () => {
    const result = chooseAttribution({
      parsed: null,
      identifiedMemberId: null,
      emailMatches: [MEMBER],
    });
    expect(result).toEqual({ memberId: MEMBER, reason: "email" });
  });

  it("falls back to the buyer email when the identity names nobody", () => {
    // A cascade-deleted member takes their intents with them, but the purchase
    // and its renewals live on for years.
    const result = chooseAttribution({
      parsed: parseCustom(IDENTITY),
      identifiedMemberId: null,
      emailMatches: [MEMBER],
    });
    expect(result).toEqual({ memberId: MEMBER, reason: "email" });
  });

  it("reports an unresolved identity when nothing else matches", () => {
    // Distinct from "no reference at all" — an unresolved ds: is the signal
    // that an intent was deleted, and deserves a louder log line.
    const result = chooseAttribution({
      parsed: parseCustom(IDENTITY),
      identifiedMemberId: null,
      emailMatches: [],
    });
    expect(result).toEqual({ memberId: null, reason: "identityUnresolved" });
  });

  it("refuses to guess when the email matches several Members", () => {
    // Guessing splits customer money across accounts. Story 1.7 exists so this
    // ends as a support case rather than a wrong write.
    const result = chooseAttribution({
      parsed: null,
      identifiedMemberId: null,
      emailMatches: [MEMBER, OTHER],
    });
    expect(result).toEqual({ memberId: null, reason: "ambiguous" });
  });

  it("leaves an anonymous purchase unattributed", () => {
    const result = chooseAttribution({
      parsed: null,
      identifiedMemberId: null,
      emailMatches: [],
    });
    expect(result).toEqual({ memberId: null, reason: "none" });
  });

  it("treats a legacy token marker as no identity at all", () => {
    // "tokens:<key>" says WHAT was bought, never WHO bought it.
    const result = chooseAttribution({
      parsed: parseCustom("tokens:pro"),
      identifiedMemberId: null,
      emailMatches: [MEMBER],
    });
    expect(result).toEqual({ memberId: MEMBER, reason: "email" });
  });

  it("never invents a member id", () => {
    for (const emailMatches of [[], [MEMBER, OTHER]]) {
      const result = chooseAttribution({
        parsed: null,
        identifiedMemberId: null,
        emailMatches,
      });
      expect(result.memberId).toBeNull();
    }
  });
});

describe("shouldCreditTokens", () => {
  const ok = { packageKey: "pro", status: "paid", orderId: "O1", memberId: "m1" };

  it("credits an attributed, paid token purchase", () => {
    expect(shouldCreditTokens(ok)).toBe(true);
  });

  it("refuses an unattributed purchase — AD-3", () => {
    // Money was taken and will not be credited until the purchase is claimed.
    expect(shouldCreditTokens({ ...ok, memberId: null })).toBe(false);
  });

  it("does not depend on a buyer email", () => {
    // A payment identified by the identity string must be credited even when
    // Digistore24 sends no address. Re-adding an email condition here would
    // undo the reason identity is carried at all.
    expect(shouldCreditTokens(ok)).toBe(true);
  });

  it("refuses anything that is not a paid token purchase", () => {
    expect(shouldCreditTokens({ ...ok, packageKey: null })).toBe(false);
    expect(shouldCreditTokens({ ...ok, status: "refunded" })).toBe(false);
    expect(shouldCreditTokens({ ...ok, status: null })).toBe(false);
    expect(shouldCreditTokens({ ...ok, orderId: undefined })).toBe(false);
  });
});

describe("shouldArmAutoReload", () => {
  const armed = {
    armAutoReload: true,
    reason: "identity" as const,
    purchaseId: "PUR-1",
    isTokenPackage: true,
    creditWasBooked: true,
  };

  it("arms when the buyer asked and the identity resolved", () => {
    expect(shouldArmAutoReload(armed)).toBe(true);
  });

  it("refuses when the buyer never asked", () => {
    // Every purchase made before this shipped, and every anonymous one claimed
    // later. Those buyers were never offered the choice.
    expect(shouldArmAutoReload({ ...armed, armAutoReload: false })).toBe(false);
  });

  it("refuses when the payment was matched by EMAIL, not identity", () => {
    // The one that matters most. A rotated token or a deleted member drops the
    // payment to a unique buyer-email match — possibly a DIFFERENT Member.
    // Arming them would charge a card belonging to somebody who never asked.
    expect(shouldArmAutoReload({ ...armed, reason: "email" })).toBe(false);
  });

  it("refuses every non-identity attribution", () => {
    for (const reason of ["email", "none", "ambiguous"] as const) {
      expect(shouldArmAutoReload({ ...armed, reason }), reason).toBe(false);
    }
  });

  it("refuses without a mandate to charge against", () => {
    // setAutoReload would store null and autoReloadIfNeeded would answer
    // "not-configured" for ever — silently, which is the worst kind.
    expect(shouldArmAutoReload({ ...armed, purchaseId: null })).toBe(false);
  });

  it("refuses for a subscription — there is no balance to top up", () => {
    expect(shouldArmAutoReload({ ...armed, isTokenPackage: false })).toBe(false);
  });
});

describe("shouldArmAutoReload and redelivery", () => {
  const base = {
    armAutoReload: true,
    reason: "identity" as const,
    purchaseId: "PUR-1",
    isTokenPackage: true,
  };

  it("arms on the delivery that booked the credit", () => {
    expect(shouldArmAutoReload({ ...base, creditWasBooked: true })).toBe(true);
  });

  it("does NOT re-arm on a redelivery of an already-booked credit", () => {
    // The credit block runs on every delivery — its idempotency lives in the
    // ledger's unique index, not in an early return. Without this condition a
    // Digistore24 retry would switch auto top-up back ON for a Member who had
    // deliberately turned it off, re-arming an unattended card charge they
    // revoked.
    expect(shouldArmAutoReload({ ...base, creditWasBooked: false })).toBe(false);
  });
});
