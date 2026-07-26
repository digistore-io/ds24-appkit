// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";

import {
  IMPERSONATION_CLAIM,
  readClaim,
  impersonationState,
} from "./claim";
import { IMPERSONATION_MINUTES } from "@/lib/users/rules";

const START = new Date("2026-07-25T10:00:00Z").getTime();
const EXPIRES = START + IMPERSONATION_MINUTES * 60_000;

function tokenWith(claim: unknown) {
  return { sub: "member-1", role: "member", [IMPERSONATION_CLAIM]: claim };
}

const valid = {
  id: "rec-1",
  operatorId: "owner-1",
  operatorEmail: "owner@example.com",
  operatorRole: "owner",
  memberEmail: "member@example.com",
  expiresAt: EXPIRES,
};

describe("readClaim", () => {
  it("reads a claim we wrote", () => {
    expect(readClaim(tokenWith(valid))).toEqual(valid);
  });

  it("returns null for an ordinary token", () => {
    expect(readClaim({ sub: "member-1", role: "member" })).toBeNull();
  });

  it("returns null for a non-token", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(readClaim(bad)).toBeNull();
    }
  });

  // The claim is inside a token WE signed, so this is not defending against an
  // attacker — it is defending against a shape change. A half-written claim
  // that read as valid would restore a session to `undefined`.
  it("refuses a claim missing any load-bearing field", () => {
    for (const field of ["id", "operatorId", "operatorRole", "expiresAt"]) {
      const broken: Record<string, unknown> = { ...valid };
      delete broken[field];
      expect(readClaim(tokenWith(broken))).toBeNull();
    }
  });

  it("refuses an empty id or operator id", () => {
    expect(readClaim(tokenWith({ ...valid, id: "" }))).toBeNull();
    expect(readClaim(tokenWith({ ...valid, operatorId: "" }))).toBeNull();
  });

  it("refuses a non-numeric or infinite deadline", () => {
    for (const expiresAt of ["soon", NaN, Infinity, null]) {
      expect(readClaim(tokenWith({ ...valid, expiresAt }))).toBeNull();
    }
  });

  it("tolerates a missing address on either side", () => {
    const claim = readClaim(
      tokenWith({ ...valid, operatorEmail: undefined, memberEmail: undefined }),
    );
    expect(claim).not.toBeNull();
    expect(claim!.operatorEmail).toBeNull();
    expect(claim!.memberEmail).toBeNull();
  });
});

describe("impersonationState", () => {
  it("is none without a claim", () => {
    expect(impersonationState({ sub: "u1" }, START).kind).toBe("none");
  });

  it("is running inside the window", () => {
    expect(impersonationState(tokenWith(valid), START + 60_000).kind).toBe(
      "running",
    );
  });

  it("is running one millisecond before the deadline", () => {
    expect(impersonationState(tokenWith(valid), EXPIRES - 1).kind).toBe("running");
  });

  // The whole reason the expiry is resolved on every READ rather than by
  // rewriting the token: no page render may write a cookie, so a stale claim is
  // normal and every reader has to honour the deadline itself.
  it("is expired exactly at the deadline", () => {
    expect(impersonationState(tokenWith(valid), EXPIRES).kind).toBe("expired");
  });

  it("is expired long afterwards, and still carries who to restore", () => {
    const state = impersonationState(tokenWith(valid), EXPIRES + 86_400_000);
    expect(state.kind).toBe("expired");
    expect(state.kind === "expired" && state.claim.operatorId).toBe("owner-1");
    expect(state.kind === "expired" && state.claim.operatorRole).toBe("owner");
  });

  it("is none — not expired — when the claim is unreadable", () => {
    // A broken claim must not present as an expired impersonation: that would
    // restore a session to an operator id of `undefined`.
    expect(impersonationState(tokenWith({ id: "only" }), START).kind).toBe("none");
  });
});
