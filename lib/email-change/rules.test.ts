// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  CONFIRMATION_TTL_MS,
  checkRequestedEmail,
  expiryFrom,
  isExpired,
} from "./rules";

describe("checkRequestedEmail", () => {
  it("accepts a different, valid address", () => {
    expect(checkRequestedEmail("alt@example.de", "neu@example.de")).toBeNull();
  });

  it("refuses an unusable address", () => {
    // `null` is what normalizeEmail returns for anything it cannot use, so this
    // is the shape the caller actually passes.
    expect(checkRequestedEmail("alt@example.de", null)).toBe("invalidEmail");
  });

  it("calls the address you already have 'unchanged', not 'invalid'", () => {
    // Somebody typing their own address has made no mistake worth a red
    // message. Telling them it is invalid would be a lie about their address.
    expect(checkRequestedEmail("gleich@example.de", "gleich@example.de")).toBe(
      "emailUnchanged",
    );
  });

  it("expects both sides already normalised", () => {
    // Normalisation is normalizeEmail (lib/users/rules.ts) and happens once, in
    // the shell. If it were duplicated here the two could drift, and "same
    // address" would start meaning two different things in one request.
    expect(checkRequestedEmail("gleich@example.de", "Gleich@Example.de")).toBeNull();
  });

  it("allows a change from an account that has no address yet", () => {
    expect(checkRequestedEmail(null, "neu@example.de")).toBeNull();
  });
});

describe("expiry", () => {
  const NOW = new Date("2026-07-24T12:00:00Z");

  it("is 24 hours, the same as the magic link", () => {
    // Two different answers to "how long do I have?" for two mails that arrive
    // the same way would be a difference nobody could explain.
    expect(CONFIRMATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(expiryFrom(NOW).toISOString()).toBe("2026-07-25T12:00:00.000Z");
  });

  it("counts a link inside the window as usable", () => {
    expect(isExpired(expiryFrom(NOW), NOW)).toBe(false);
    expect(isExpired(new Date("2026-07-24T12:00:01Z"), NOW)).toBe(false);
  });

  it("counts the exact expiry moment as expired", () => {
    // Compared, never scheduled — nothing prunes this table, so the answer has
    // to be right at the one moment somebody presents the link.
    expect(isExpired(NOW, NOW)).toBe(true);
  });

  it("counts a past expiry as expired", () => {
    expect(isExpired(new Date("2026-07-24T11:59:59Z"), NOW)).toBe(true);
  });
});
