// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  isClaimable,
  CLAIMABLE_STATUSES,
  GRANTABLE_STATUSES,
  type OrderStatus,
} from "./claimable";

// These assertions are the ONLY committed coverage of the claim filter. Before
// this file existed the rule lived in four SQL `where` clauses and was caught
// exclusively by `.dev/verify-grants.mjs` — gitignored, never part of the test
// run, and not shipped to the customer. Every wrong widening passed
// `node run.mjs test`.
describe("isClaimable", () => {
  it("lets a cancelled subscription be claimed — access continues to the paid-through date", () => {
    // Story 2.3: cancelling stops billing, not access. Filtered to `paid`, an
    // anonymous buyer who cancelled before signing up could claim by no route.
    expect(isClaimable("cancelled")).toBe(true);
  });

  it("lets a paused subscription be claimed — a missed payment is reversible", () => {
    expect(isClaimable("paused")).toBe(true);
  });

  it("refuses a refunded purchase", () => {
    // The money went back. This is the FIRST line of defence; story 2.2's
    // terminal endedAt guard is the second and cannot fire when no grant row
    // was ever created.
    expect(isClaimable("refunded")).toBe(false);
  });

  it("refuses a charged-back purchase", () => {
    expect(isClaimable("chargeback")).toBe(false);
  });

  it("decides every status the enum has — a new one must not default in", () => {
    const all: OrderStatus[] = [
      "paid",
      "refunded",
      "chargeback",
      "paused",
      "cancelled",
    ];
    for (const s of all) expect(typeof isClaimable(s)).toBe("boolean");
    expect(all.filter(isClaimable).sort()).toEqual(
      [...CLAIMABLE_STATUSES].sort(),
    );
  });
});

describe("GRANTABLE_STATUSES", () => {
  it("does NOT include paused — signing in must not launder away a suspension", () => {
    // Story 2.4 suspends a grant on on_payment_missed. The claim path answers
    // `activate` for every order it looks at, so a paused order in the grant
    // pass would hand back a live entitlement on the next sign-in, permanently:
    // Digistore24 does not redeliver an acknowledged event.
    expect(GRANTABLE_STATUSES).not.toContain("paused");
  });

  it("is a subset of what is claimable", () => {
    for (const s of GRANTABLE_STATUSES) expect(isClaimable(s)).toBe(true);
  });

  it("still grants a cancelled subscription inside its paid period", () => {
    expect(GRANTABLE_STATUSES).toContain("cancelled");
  });
});
