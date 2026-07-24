import { describe, it, expect } from "vitest";
import {
  ATTEMPT_WINDOW_MS,
  MAX_ATTEMPTS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  canChangePassword,
  checkNewPassword,
  isLockedOut,
  passwordLength,
  recentAttempts,
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

describe("rate limiting", () => {
  const NOW = 1_700_000_000_000;

  it("forgets failures once they leave the window", () => {
    const old = NOW - ATTEMPT_WINDOW_MS - 1;
    expect(recentAttempts([old], NOW)).toEqual([]);
    // Exactly on the boundary counts as expired, not as recent.
    expect(recentAttempts([NOW - ATTEMPT_WINDOW_MS], NOW)).toEqual([]);
  });

  it("keeps failures inside the window", () => {
    const recent = NOW - 1000;
    expect(recentAttempts([recent], NOW)).toEqual([recent]);
  });

  it("locks out at the limit, not before", () => {
    const under = Array.from({ length: MAX_ATTEMPTS - 1 }, () => NOW - 10);
    expect(isLockedOut(under, NOW)).toBe(false);

    const at = Array.from({ length: MAX_ATTEMPTS }, () => NOW - 10);
    expect(isLockedOut(at, NOW)).toBe(true);
  });

  it("lets the window slide — an old burst does not lock anyone out for ever", () => {
    // The real owner must be able to get back in by waiting. A lockout that
    // outlives the attack is itself a denial of service.
    const burst = Array.from(
      { length: MAX_ATTEMPTS * 2 },
      () => NOW - ATTEMPT_WINDOW_MS - 1,
    );
    expect(isLockedOut(burst, NOW)).toBe(false);
  });

  it("treats an empty history as unlocked", () => {
    expect(isLockedOut([], NOW)).toBe(false);
  });
});
