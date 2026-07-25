import { describe, it, expect } from "vitest";
import {
  ATTEMPT_WINDOW_MS,
  LOOKUP_LIMIT,
  LOOKUP_ORIGIN_LIMIT,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SIGN_IN_ORIGIN_LIMIT,
  canChangePassword,
  checkNewPassword,
  normaliseEmail,
  passwordLength,
} from "./rules";

const OK = "correct horse battery"; // comfortably over the minimum

describe("passwordLength", () => {
  it("counts code points, not UTF-16 units", () => {
    // "🔑".length is 2 in JavaScript. Somebody who types five key emoji has
    // typed five characters, and being told that is "ten" would be nonsense.
    expect(passwordLength("🔑🔑🔑🔑🔑")).toBe(5);
    expect(passwordLength("abc")).toBe(3);
  });
});

describe("checkNewPassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(checkNewPassword("a".repeat(MIN_PASSWORD_LENGTH), "a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("refuses one character below the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(checkNewPassword(short, short)).toBe("passwordTooShort");
  });

  it("refuses one character above the maximum", () => {
    const long = "a".repeat(MAX_PASSWORD_LENGTH + 1);
    expect(checkNewPassword(long, long)).toBe("passwordTooLong");
  });

  it("accepts exactly the maximum", () => {
    const long = "a".repeat(MAX_PASSWORD_LENGTH);
    expect(checkNewPassword(long, long)).toBeNull();
  });

  it("refuses a mistyped confirmation", () => {
    expect(checkNewPassword(OK, OK + "x")).toBe("passwordMismatch");
  });

  it("checks the length before the confirmation", () => {
    // Otherwise somebody who typed a short password twice is told the two do
    // not match, which is both wrong and impossible to act on.
    expect(checkNewPassword("abc", "xyz")).toBe("passwordTooShort");
  });

  it("imposes NO composition rules", () => {
    // Length is the rule. A long all-lowercase passphrase is fine, and this
    // test exists so that a well-meaning "must contain a digit" cannot be
    // added without deleting it first.
    expect(checkNewPassword("alldownlowercase", "alldownlowercase")).toBeNull();
  });

  it("does not trim — surrounding spaces are part of the password", () => {
    // Trimming would store a different password from the one that was typed,
    // which surfaces later as "it worked yesterday".
    const padded = `  ${OK}  `;
    expect(checkNewPassword(padded, padded)).toBeNull();
    expect(checkNewPassword(padded, OK)).toBe("passwordMismatch");
  });
});

describe("canChangePassword", () => {
  it("allows it when one is set", () => {
    expect(canChangePassword({ hasPassword: true })).toBeNull();
  });

  it("refuses when there is none", () => {
    expect(canChangePassword({ hasPassword: false })).toBe("noPasswordSet");
  });
});

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("survives the empty string rather than throwing", () => {
    // The sign-in form can submit one, and a lookup on "" must be an ordinary
    // miss, not a crash on the sign-in path.
    expect(normaliseEmail("")).toBe("");
    expect(normaliseEmail("   ")).toBe("");
  });
});

describe("the lookup limits", () => {
  // These meter the step-1 address lookup on /login — the one thing in this app
  // that answers a question about an address nobody has proved they own.

  it("counts in the same window as the sign-in limits", () => {
    // One number to reason about, not three. If these ever diverge it should be
    // because somebody decided to, not because a literal was pasted.
    expect(LOOKUP_LIMIT.windowMs).toBe(ATTEMPT_WINDOW_MS);
    expect(LOOKUP_ORIGIN_LIMIT.windowMs).toBe(ATTEMPT_WINDOW_MS);
  });

  it("is more generous per address than per origin is per origin", () => {
    // A person fumbling their own address a few times must never hit it; a
    // script walking an address list is what the origin counter is for.
    expect(LOOKUP_LIMIT.max).toBeGreaterThan(0);
    expect(LOOKUP_ORIGIN_LIMIT.max).toBeGreaterThan(LOOKUP_LIMIT.max);
  });

  it("tolerates more lookups per origin than failed sign-ins per origin", () => {
    // A lookup is counted on EVERY hit, a failed sign-in only on failures. The
    // same number would therefore be a much tighter limit here, and would fire
    // on an office behind one NAT going about its day.
    expect(LOOKUP_ORIGIN_LIMIT.max).toBeGreaterThanOrEqual(SIGN_IN_ORIGIN_LIMIT.max);
  });
});

// The sliding-window mechanism moved to lib/rate-limit.ts when the
// change-address mails needed one too — it is tested there, together with the
// numbers this file decides (SIGN_IN_LIMIT).
