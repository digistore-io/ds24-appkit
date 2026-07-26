// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./hash";

// scrypt is deliberately slow — that is the entire point of using it. A handful
// of hashes per test file is fine; do not add loops here.
const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
  it("produces a self-describing, parameterised string", () => {
    // The parameters travel WITH the hash so the cost can be raised later
    // without invalidating every existing password.
    return hashPassword(PASSWORD).then((stored) => {
      const parts = stored.split("$");
      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe("scrypt");
      expect(Number(parts[1])).toBeGreaterThan(1);
    });
  });

  it("never contains the password", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(stored.toLowerCase()).not.toContain("staple");
  });

  it("salts — the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([
      hashPassword(PASSWORD),
      hashPassword(PASSWORD),
    ]);
    expect(a).not.toEqual(b);
    // …and both still verify.
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it("rejects the wrong one", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD + "!", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("is case- and whitespace-exact", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD.toUpperCase(), stored)).toBe(false);
    expect(await verifyPassword(` ${PASSWORD}`, stored)).toBe(false);
  });

  it("returns false for an account with no password, rather than throwing", async () => {
    // This is the common case — most accounts never set one — so it must be a
    // plain false and never a 500 on the sign-in path.
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(await verifyPassword(PASSWORD, undefined)).toBe(false);
  });

  it("returns false for a corrupt stored value, rather than throwing", async () => {
    for (const junk of [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$onlyfiveparts",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
      "scrypt$0$8$1$c2FsdA==$aGFzaA==",
      "scrypt$abc$8$1$c2FsdA==$aGFzaA==",
      "scrypt$16384$8$1$$",
    ]) {
      expect(await verifyPassword(PASSWORD, junk), junk).toBe(false);
    }
  });

  it("matches the same password typed with different Unicode normalisation", async () => {
    // "ä" as one code point vs. "a" + combining diaeresis. A Mac and a Windows
    // keyboard can produce either; telling the user their correct password is
    // wrong because of it would be unexplainable.
    const composed = "Bärenstark123";
    const decomposed = composed.normalize("NFD");
    expect(composed).not.toBe(decomposed); // the test would be vacuous otherwise

    const stored = await hashPassword(composed);
    expect(await verifyPassword(decomposed, stored)).toBe(true);
  });
});
