// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from "vitest";
import {
  type Limit,
  clearKey,
  forgetOne,
  isLimited,
  isOverLimit,
  record,
  resetRateLimits,
  withinWindow,
} from "./rate-limit";
import { SIGN_IN_LIMIT, SIGN_IN_ORIGIN_LIMIT } from "./credentials/rules";
import { CONFIRMATION_LIMIT } from "./email-change/rules";

const NOW = 1_700_000_000_000;
const LIMIT: Limit = { max: 3, windowMs: 60_000 };

describe("withinWindow", () => {
  it("forgets hits once they leave the window", () => {
    expect(withinWindow([NOW - 60_001], NOW, 60_000)).toEqual([]);
    // Exactly on the boundary counts as expired, not as recent.
    expect(withinWindow([NOW - 60_000], NOW, 60_000)).toEqual([]);
  });

  it("keeps hits inside the window", () => {
    expect(withinWindow([NOW - 1000], NOW, 60_000)).toEqual([NOW - 1000]);
  });
});

describe("isOverLimit", () => {
  it("trips at the limit, not before", () => {
    const under = Array.from({ length: LIMIT.max - 1 }, () => NOW - 10);
    expect(isOverLimit(under, NOW, LIMIT)).toBe(false);
    expect(isOverLimit([...under, NOW - 10], NOW, LIMIT)).toBe(true);
  });

  it("lets the window slide — an old burst does not lock anyone out for ever", () => {
    // The real owner must be able to get back in by waiting. A lockout that
    // outlives the attack is itself a denial of service.
    const old = Array.from({ length: LIMIT.max * 5 }, () => NOW - 60_001);
    expect(isOverLimit(old, NOW, LIMIT)).toBe(false);
  });

  it("treats an empty history as under the limit", () => {
    expect(isOverLimit([], NOW, LIMIT)).toBe(false);
  });
});

describe("the store", () => {
  beforeEach(() => resetRateLimits());

  it("counts per key, not per bucket", () => {
    for (let i = 0; i < LIMIT.max; i++) record("b", "a@example.de", LIMIT, NOW);
    expect(isLimited("b", "a@example.de", LIMIT, NOW)).toBe(true);
    expect(isLimited("b", "b@example.de", LIMIT, NOW)).toBe(false);
  });

  it("keeps buckets apart", () => {
    // Sign-in failures must not spend somebody's change-address budget.
    for (let i = 0; i < LIMIT.max; i++) record("one", "k", LIMIT, NOW);
    expect(isLimited("one", "k", LIMIT, NOW)).toBe(true);
    expect(isLimited("two", "k", LIMIT, NOW)).toBe(false);
  });

  it("lets a key back in once the window has passed", () => {
    for (let i = 0; i < LIMIT.max; i++) record("b", "k", LIMIT, NOW);
    expect(isLimited("b", "k", LIMIT, NOW)).toBe(true);
    expect(isLimited("b", "k", LIMIT, NOW + LIMIT.windowMs + 1)).toBe(false);
  });

  it("clearKey forgets one key and leaves the rest", () => {
    for (let i = 0; i < LIMIT.max; i++) {
      record("b", "k1", LIMIT, NOW);
      record("b", "k2", LIMIT, NOW);
    }
    clearKey("b", "k1");
    expect(isLimited("b", "k1", LIMIT, NOW)).toBe(false);
    expect(isLimited("b", "k2", LIMIT, NOW)).toBe(true);
  });
});

describe("the limits this app actually uses", () => {
  it("is generous on sign-in and strict on outbound mail", () => {
    // The person who most often gets a password wrong ten times is the one who
    // owns the account. Nobody legitimately asks for a fourth confirmation mail
    // inside an hour, and each one is sent to an address the requester chose.
    expect(SIGN_IN_LIMIT).toEqual({ max: 10, windowMs: 15 * 60 * 1000 });
    expect(CONFIRMATION_LIMIT).toEqual({ max: 3, windowMs: 60 * 60 * 1000 });
  });
});

describe("the origin-keyed sign-in limit", () => {
  beforeEach(() => resetRateLimits());

  it("fires against somebody varying the address on every attempt", () => {
    // The per-address counter cannot: it sees one hit per address. This is
    // what catches one password sprayed across many accounts from one source.
    const NOW = 1_700_000_000_000;
    for (let i = 0; i < SIGN_IN_ORIGIN_LIMIT.max; i++) {
      expect(isLimited("o", "203.0.113.9", SIGN_IN_ORIGIN_LIMIT, NOW)).toBe(false);
      record("o", "203.0.113.9", SIGN_IN_ORIGIN_LIMIT, NOW);
    }
    expect(isLimited("o", "203.0.113.9", SIGN_IN_ORIGIN_LIMIT, NOW)).toBe(true);
    // …and only against that origin.
    expect(isLimited("o", "198.51.100.1", SIGN_IN_ORIGIN_LIMIT, NOW)).toBe(false);
  });

  it("is looser than the per-address one, because it catches shared origins too", () => {
    // An office behind one NAT shares an origin. The limit has to leave room
    // for several people fumbling a password without locking the building out.
    expect(SIGN_IN_ORIGIN_LIMIT.max).toBeGreaterThan(SIGN_IN_LIMIT.max);
  });
});

describe("forgetOne", () => {
  const limit = { max: 3, windowMs: 60_000 };

  it("gives back exactly one hit, not the whole history", () => {
    // The upload endpoint records before it reads the body — reading a 49 MB
    // part is the expense the limit protects — and then has to refund the one
    // case that costs nothing, a POST with no file in it. `clearKey()` would
    // have made an empty request a way to reset the quota, which is a wider
    // hole than the one being closed.
    record("b", "alice", limit);
    record("b", "alice", limit);
    record("b", "alice", limit);
    expect(isLimited("b", "alice", limit)).toBe(true);

    forgetOne("b", "alice");
    expect(isLimited("b", "alice", limit)).toBe(false);

    record("b", "alice", limit);
    expect(isLimited("b", "alice", limit)).toBe(true);
  });

  it("is harmless for a key with no history", () => {
    expect(() => forgetOne("b", "nobody")).not.toThrow();
  });
});
