// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { maySignIn } from "./blocked";

// The regression these tests exist for: every first-ever sign-in in
// STAGING/PROD was rejected with "account blocked".
//
// Auth.js hands the signIn callback a freshly minted id for an account it is
// about to create. The old check asked isUserBlocked(), which answers "blocked"
// for an id it cannot find — correct for a running session whose account was
// deleted, wrong for one that does not exist yet.
//
// It was invisible in development because the dev login inserts the row before
// the callback runs, so the id always resolved.

describe("maySignIn", () => {
  it("lets an ordinary account in", () => {
    expect(maySignIn("allowed", false)).toBe(true);
  });

  it("keeps a blocked account out", () => {
    expect(maySignIn("blocked", false)).toBe(false);
  });

  it("lets a brand-new account in — the regression", () => {
    // No row yet: Auth.js is about to create it. This is the case that was
    // returning false and telling first-time buyers they were blocked.
    expect(maySignIn("unknown", false)).toBe(true);
  });

  it("still keeps a blocked ADDRESS out when the account does not exist yet", () => {
    // An operator can block an address before anyone ever signs up with it.
    // The account has no row, so only the address can carry the block.
    expect(maySignIn("unknown", true)).toBe(false);
  });

  it("lets a blocked account stay blocked regardless of the address check", () => {
    expect(maySignIn("blocked", true)).toBe(false);
    expect(maySignIn("blocked", false)).toBe(false);
  });

  it("does not let a blocked address override an existing, allowed account", () => {
    // The row is the authority once it exists — an address block is applied by
    // blocking the account, not by leaving a stale address rule in place.
    expect(maySignIn("allowed", true)).toBe(true);
  });
});
