// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  currentConsent,
  isAllowed,
  needsAsking,
  isValidPurposeKey,
  isValidTextVersion,
  type ConsentPurpose,
  type ConsentRecord,
} from "./rules";

const MARKETING: ConsentPurpose = { key: "marketing_email", textVersion: "2026-07-26" };
const ANALYTICS: ConsentPurpose = { key: "analytics", textVersion: "1" };

function record(over: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    purpose: MARKETING.key,
    granted: true,
    textVersion: MARKETING.textVersion,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    ...over,
  };
}

describe("currentConsent", () => {
  it("is unasked when there is nothing", () => {
    expect(currentConsent([], MARKETING)).toBe("unasked");
  });

  it("is unasked when the only records are for another purpose", () => {
    // The realistic version of this bug: an app with two purposes reading the
    // whole list and forgetting to filter, so agreeing to one grants the other.
    expect(currentConsent([record({ purpose: "analytics" })], MARKETING)).toBe("unasked");
  });

  it("is granted on a yes to the current wording", () => {
    expect(currentConsent([record()], MARKETING)).toBe("granted");
  });

  it("is refused on a no", () => {
    expect(currentConsent([record({ granted: false })], MARKETING)).toBe("refused");
  });

  it("is stale when the yes was to an older wording", () => {
    // The whole reason `textVersion` exists. Somebody agreed to
    // "we mail you when your invoice is ready"; the sentence now says
    // "we mail you offers from our partners". That is a different question.
    expect(currentConsent([record({ textVersion: "2026-01-01" })], MARKETING)).toBe("stale");
  });

  it("lets the newest record win, whatever order they arrive in", () => {
    const granted = record({ createdAt: new Date("2026-07-01T10:00:00Z") });
    const withdrawn = record({
      granted: false,
      createdAt: new Date("2026-07-20T10:00:00Z"),
    });

    expect(currentConsent([granted, withdrawn], MARKETING)).toBe("refused");
    expect(currentConsent([withdrawn, granted], MARKETING)).toBe("refused");
  });

  it("treats a re-grant after a withdrawal as granted", () => {
    const first = record({ createdAt: new Date("2026-07-01T10:00:00Z") });
    const withdrawn = record({
      granted: false,
      createdAt: new Date("2026-07-10T10:00:00Z"),
    });
    const again = record({ createdAt: new Date("2026-07-20T10:00:00Z") });

    expect(currentConsent([first, withdrawn, again], MARKETING)).toBe("granted");
  });

  it("breaks a timestamp tie toward the later entry", () => {
    // Two clicks inside one millisecond. Insertion order is then the only thing
    // that still knows which came second — without this the answer flips
    // depending on how the rows happened to sort.
    const at = new Date("2026-07-01T10:00:00Z");
    const granted = record({ createdAt: at });
    const withdrawn = record({ granted: false, createdAt: at });

    expect(currentConsent([granted, withdrawn], MARKETING)).toBe("refused");
    expect(currentConsent([withdrawn, granted], MARKETING)).toBe("granted");
  });

  it("compares versions per purpose, not globally", () => {
    const records = [
      record({ purpose: ANALYTICS.key, textVersion: "1" }),
      record({ purpose: MARKETING.key, textVersion: "2026-07-26" }),
    ];

    expect(currentConsent(records, ANALYTICS)).toBe("granted");
    expect(currentConsent(records, MARKETING)).toBe("granted");
  });
});

describe("isAllowed", () => {
  it("permits only a current yes", () => {
    expect(isAllowed("granted")).toBe(true);
    expect(isAllowed("refused")).toBe(false);
    expect(isAllowed("unasked")).toBe(false);
  });

  it("does NOT permit a stale yes", () => {
    // The trap: `stale` reads as "they said yes once". Acting on it is
    // processing on a consent to a question you have since changed.
    expect(isAllowed("stale")).toBe(false);
  });
});

describe("needsAsking", () => {
  it("asks when never asked, and again when the wording changed", () => {
    expect(needsAsking("unasked")).toBe(true);
    expect(needsAsking("stale")).toBe(true);
  });

  it("does not re-ask somebody who declined", () => {
    // Repeated prompting is what turns a dialog into pressure, and pressure is
    // what stops consent being "freely given". A refusal is an answer.
    expect(needsAsking("refused")).toBe(false);
  });

  it("does not re-ask somebody who agreed", () => {
    expect(needsAsking("granted")).toBe(false);
  });
});

describe("isValidPurposeKey", () => {
  it("accepts what survives a column, a JSON file and a translation key", () => {
    expect(isValidPurposeKey("marketing_email")).toBe(true);
    expect(isValidPurposeKey("analytics2")).toBe(true);
  });

  it("rejects the shapes that break one of the three", () => {
    expect(isValidPurposeKey("Marketing")).toBe(false); // case matters downstream
    expect(isValidPurposeKey("marketing-email")).toBe(false); // dash, not underscore
    expect(isValidPurposeKey("marketing.email")).toBe(false); // would nest the i18n key
    expect(isValidPurposeKey("2fa")).toBe(false); // must start with a letter
    expect(isValidPurposeKey("a")).toBe(false); // one character says nothing
    expect(isValidPurposeKey("")).toBe(false);
    expect(isValidPurposeKey(undefined)).toBe(false);
    expect(isValidPurposeKey(42)).toBe(false);
  });
});

describe("isValidTextVersion", () => {
  it("accepts anything short and non-empty", () => {
    expect(isValidTextVersion("2026-07-26")).toBe(true);
    expect(isValidTextVersion("v2")).toBe(true);
  });

  it("rejects empty, blank and absent", () => {
    expect(isValidTextVersion("")).toBe(false);
    expect(isValidTextVersion("   ")).toBe(false);
    expect(isValidTextVersion(undefined)).toBe(false);
    expect(isValidTextVersion("x".repeat(65))).toBe(false);
  });
});
