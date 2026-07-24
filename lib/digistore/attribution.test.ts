import { describe, it, expect } from "vitest";
import { chooseAttribution, shouldCreditTokens } from "./attribution";
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
