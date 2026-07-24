import { describe, it, expect, beforeEach } from "vitest";
import {
  type Limit,
  clearKey,
  isLimited,
  isOverLimit,
  record,
  resetRateLimits,
  withinWindow,
} from "./rate-limit";
import { SIGN_IN_LIMIT } from "./credentials/rules";
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
