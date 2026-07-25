import { describe, it, expect } from "vitest";

import {
  accessUntilFromDay,
  canGrantByHand,
  canRevokeGrant,
  grantableProducts,
  GRANT_ERROR_CODES,
  normalizeGrantReason,
} from "./grant-rules";
import { allProducts } from "@/lib/digistore/products";
import type { Actor } from "@/lib/users/rules";

const OWNER: Actor = { id: "op-1", role: "owner" };
const MEMBER: Actor = { id: "u-2", role: "member" };
const NOW = new Date("2026-07-22T10:00:00.000Z");

function input(over: Partial<Parameters<typeof canGrantByHand>[0]> = {}) {
  return {
    actor: OWNER,
    productKind: "subscription" as const,
    reason: "comp for support case #42",
    accessUntil: null,
    now: NOW,
    ...over,
  };
}

// --- §D2 write side: the day the Operator picked, to the END of that day -----
describe("accessUntilFromDay", () => {
  it("returns the END of the chosen day, in UTC", () => {
    // The whole point. `new Date("2026-08-01")` is UTC MIDNIGHT, so an Operator
    // in Berlin picking 1 August would get access ending 02:00 local ON the
    // 1st — a whole day early, and invisible in the stored value.
    expect(accessUntilFromDay("2026-08-01")?.toISOString()).toBe(
      "2026-08-01T23:59:59.999Z",
    );
  });

  it("is strictly LATER than midnight of the chosen day", () => {
    const naive = new Date("2026-08-01");
    expect(accessUntilFromDay("2026-08-01")!.getTime()).toBeGreaterThan(
      naive.getTime(),
    );
  });

  it("still covers a Berlin Operator's whole chosen day (UTC+2)", () => {
    // 1 August 23:59 in Berlin is 21:59 UTC — before the stored end. The
    // customer keeps access for the whole day the Operator named.
    const berlinEndOfDay = new Date("2026-08-01T23:59:00+02:00");
    expect(accessUntilFromDay("2026-08-01")!.getTime()).toBeGreaterThan(
      berlinEndOfDay.getTime(),
    );
  });

  it("handles a leap day and a year boundary", () => {
    expect(accessUntilFromDay("2028-02-29")?.toISOString()).toBe(
      "2028-02-29T23:59:59.999Z",
    );
    expect(accessUntilFromDay("2026-12-31")?.toISOString()).toBe(
      "2026-12-31T23:59:59.999Z",
    );
  });

  it("returns null for anything that is not an unambiguous ISO day", () => {
    for (const bad of [
      "",
      "   ",
      "not a date",
      "01.08.2026",
      "2026-08",
      "2026-8-1",
      "2026-08-01T12:00:00Z",
    ]) {
      expect(accessUntilFromDay(bad), bad).toBeNull();
    }
  });

  it("returns null for a day that does not exist, instead of rolling over", () => {
    // Date.UTC(2026, 1, 30) silently becomes 2 March. A grant must never end on
    // a day nobody typed.
    expect(accessUntilFromDay("2026-02-30")).toBeNull();
    expect(accessUntilFromDay("2026-13-01")).toBeNull();
    expect(accessUntilFromDay("2026-00-10")).toBeNull();
    expect(accessUntilFromDay("2026-08-00")).toBeNull();
    expect(accessUntilFromDay("2026-08-32")).toBeNull();
    // Two-digit years are mapped to 19xx by Date.UTC — caught by the roundtrip.
    expect(accessUntilFromDay("0099-08-01")).toBeNull();
  });
});

// --- the reason, mirroring normalizeEmail -----------------------------------
describe("normalizeGrantReason", () => {
  it("returns the trimmed reason", () => {
    expect(normalizeGrantReason("  comp for #42  ")).toBe("comp for #42");
  });

  it("rejects what the database would happily store as a reason", () => {
    // U+200B is a zero-width space: `trim()` does NOT strip it, so it passes as
    // a reason and the grants table then shows an empty cell where the only
    // record of WHY access was handed out should be. "-" and "…" are the same
    // failure with visible ink — neither says anything a person can read.
    for (const bad of [undefined, null, 42, "", "   ", "\u200B", "-", "\u2026"]) {
      expect(normalizeGrantReason(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("rejects control characters and anything past 500 characters", () => {
    expect(normalizeGrantReason("bad\u0000reason")).toBeNull();
    expect(normalizeGrantReason("bad\u001Freason")).toBeNull();
    expect(normalizeGrantReason("x".repeat(501))).toBeNull();
    expect(normalizeGrantReason("x".repeat(500))).toBe("x".repeat(500));
  });
});

// --- §D3/§D4 the decision ----------------------------------------------------
describe("canGrantByHand", () => {
  it("allows a subscription and a one-time product", () => {
    expect(canGrantByHand(input({ productKind: "subscription" }))).toBeNull();
    expect(canGrantByHand(input({ productKind: "one_time" }))).toBeNull();
  });

  it("refuses anybody who is not an Operator, before anything else", () => {
    // Authorization first: somebody who may not act must not learn from the
    // message whether their product key or their date would have been accepted.
    expect(
      canGrantByHand(
        input({ actor: MEMBER, productKind: "token", reason: "" }),
      ),
    ).toBe("notOwner");
  });

  it("refuses a token package — balance, not entitlement (AC 5)", () => {
    expect(canGrantByHand(input({ productKind: "token" }))).toBe(
      "notAGrantProduct",
    );
  });

  it("refuses an UNKNOWN key DISTINCTLY from a token package (AC 5)", () => {
    // The two must not share a code: "that key does not exist" and "token
    // packages are balance" send the Operator to different places.
    expect(canGrantByHand(input({ productKind: null }))).toBe("unknownProduct");
  });

  it("refuses without a reason (AC 1 — the grant records why)", () => {
    expect(canGrantByHand(input({ reason: "" }))).toBe("reasonRequired");
    expect(canGrantByHand(input({ reason: "   " }))).toBe("reasonRequired");
    expect(canGrantByHand(input({ reason: undefined }))).toBe("reasonRequired");
  });

  it("refuses an end date already past (AC 4)", () => {
    expect(
      canGrantByHand(input({ accessUntil: new Date(NOW.getTime() - 1) })),
    ).toBe("endDateInPast");
  });

  it("refuses an end date exactly at `now` — equal is not active", () => {
    // activeFor asks `access_until > now()`, strictly. A grant ending at this
    // instant would be born expired.
    expect(canGrantByHand(input({ accessUntil: new Date(NOW) }))).toBe(
      "endDateInPast",
    );
  });

  it("accepts an end date in the future, and no end date at all (AC 2)", () => {
    expect(
      canGrantByHand(input({ accessUntil: new Date(NOW.getTime() + 1) })),
    ).toBeNull();
    expect(canGrantByHand(input({ accessUntil: null }))).toBeNull();
  });

  it("refuses an unusable end date instead of reading it as permanent", () => {
    // The dangerous default. A day the form could not parse must NOT fall
    // through to `null`, which means "for ever".
    expect(canGrantByHand(input({ accessUntil: new Date(NaN) }))).toBe(
      "invalidEndDate",
    );
  });

  it("has NO self-guard — an Operator may grant to their own account (AC 7)", () => {
    // Unlike deleting, demoting or blocking yourself, this locks nobody out and
    // leaves the same record as any other grant.
    expect(canGrantByHand(input({ actor: OWNER }))).toBeNull();
  });

  it("only ever returns codes from GRANT_ERROR_CODES", () => {
    const seen = [
      canGrantByHand(input({ actor: MEMBER })),
      canGrantByHand(input({ productKind: "token" })),
      canGrantByHand(input({ productKind: null })),
      canGrantByHand(input({ reason: "" })),
      canGrantByHand(input({ accessUntil: new Date(0) })),
      canGrantByHand(input({ accessUntil: new Date(NaN) })),
    ];
    for (const code of seen) {
      expect(GRANT_ERROR_CODES).toContain(code);
    }
  });
});

// --- §D4 "a token package is not grantable" is asserted, not left to a dropdown
describe("grantableProducts", () => {
  it("contains no token package", () => {
    expect(grantableProducts().some((p) => p.kind === "token")).toBe(false);
  });

  it("contains every non-token product the registry declares", () => {
    // Derived from the registry, not from the two plans the template ships
    // with: an app that sells only tokens deletes them, and a test naming them
    // would go red over a supported configuration
    // (config/digistore-products.json -> "billingMode"). What must hold is the
    // complement of the test above — everything that is not a token IS
    // grantable, so nothing can quietly fall out of the dropdown.
    const keys = grantableProducts().map((p) => p.key);
    for (const product of allProducts()) {
      if (product.kind === "token") continue;
      expect(keys, product.key).toContain(product.key);
    }
  });

  it("agrees with canGrantByHand — every listed product is grantable", () => {
    // The list a dropdown renders and the rule the server enforces must not be
    // able to disagree.
    for (const p of grantableProducts()) {
      expect(canGrantByHand(input({ productKind: p.kind })), p.key).toBeNull();
    }
  });
});

// --- §D3 the revoke decision (story 3.4) -------------------------------------
describe("canRevokeGrant", () => {
  const manual = { source: "manual" as const, endedAt: null };
  const purchase = { source: "purchase" as const, endedAt: null };

  it("allows an Operator to revoke an OPEN manual grant", () => {
    expect(canRevokeGrant(OWNER, manual)).toBeNull();
  });

  it("allows revoking a manual grant whose access_until has already elapsed", () => {
    // `expired` is not a column — it is a comparison. The SQL that carries out
    // the revoke filters on `ended_at IS NULL` and nothing else, so the rule
    // must not refuse a row the statement would happily close. UI and rule
    // disagreeing here is how a row becomes unrevokable in the interface and
    // revokable over HTTP.
    expect(canRevokeGrant(OWNER, { source: "manual", endedAt: null })).toBeNull();
  });

  it("refuses anybody who is not an Operator, before anything else", () => {
    // Authorization first, exactly as canGrantByHand: somebody who may not act
    // must not learn from the message whether the grant exists or what it is.
    expect(canRevokeGrant(MEMBER, manual)).toBe("notOwner");
    expect(canRevokeGrant(MEMBER, null)).toBe("notOwner");
    expect(canRevokeGrant(MEMBER, purchase)).toBe("notOwner");
  });

  it("refuses a PURCHASE grant — AC 2, the money gate", () => {
    // ⛔ The one that matters. AD-1 forbids the admin surface from ending a
    // purchase grant at all: `endedAt` is terminal, and taking away access
    // somebody paid for cannot be undone. Hiding the button is not this rule —
    // the server action is an HTTP endpoint of its own.
    expect(canRevokeGrant(OWNER, purchase)).toBe("notManual");
  });

  it("refuses a purchase grant that is already ended, as notManual", () => {
    // Provenance before state: "that grant came from a purchase" is the more
    // fundamental answer, and it is the one an Operator has to read.
    expect(
      canRevokeGrant(OWNER, { source: "purchase", endedAt: new Date(NOW) }),
    ).toBe("notManual");
  });

  it("refuses a grant that does not exist", () => {
    // The id is a client-submitted value. `null` is what the lookup returns
    // for an id belonging to nothing — and for a grant of another Member that
    // has since been deleted with them (`grants.member_id` cascades).
    expect(canRevokeGrant(OWNER, null)).toBe("grantNotFound");
  });

  it("refuses a manual grant that is already ended (AC 4)", () => {
    // The second submit of the same revoke. `endedAt` is terminal (§D5): there
    // is no un-revoke, so re-revoking must change nothing — least of all the
    // recorded time.
    expect(
      canRevokeGrant(OWNER, { source: "manual", endedAt: new Date(NOW) }),
    ).toBe("alreadyEnded");
  });

  it("only ever returns codes from GRANT_ERROR_CODES", () => {
    const seen = [
      canRevokeGrant(MEMBER, manual),
      canRevokeGrant(OWNER, null),
      canRevokeGrant(OWNER, purchase),
      canRevokeGrant(OWNER, { source: "manual", endedAt: new Date(NOW) }),
    ];
    for (const code of seen) {
      expect(GRANT_ERROR_CODES).toContain(code);
    }
  });

  it("has NO self-guard — an Operator may revoke their own grant", () => {
    // Symmetric with canGrantByHand (AC 7 of story 3.3). Revoking your own comp
    // locks nobody out; it leaves the same record as any other revocation.
    expect(canRevokeGrant(OWNER, manual)).toBeNull();
  });
});

describe("canGrantByHand — the product guard is positive, not a deny-list", () => {
  const base = {
    actor: { id: "op", role: "owner" as const },
    reason: "Kulanz",
    accessUntil: null,
    now: new Date("2026-07-22T12:00:00Z"),
  };

  it("refuses a kind it does not positively recognise", () => {
    // safeProductKind is TYPED `ProductKind | null` but can return undefined at
    // runtime: the registry is a plain JSON object, so raw.products.constructor
    // resolves through Object.prototype and yields `{}.kind === undefined`. A
    // deny-list (`=== null || === "token"`) let that straight through to a
    // permanent grant, and hasPlan() then answered true for "constructor".
    for (const kind of [undefined, "Token", "plan", ""] as unknown as (
      | "subscription"
      | "one_time"
      | "token"
      | null
    )[]) {
      expect(canGrantByHand({ ...base, productKind: kind })).toBe(
        "unknownProduct",
      );
    }
  });

  it("still names the two grantable kinds and refuses a token package by name", () => {
    expect(canGrantByHand({ ...base, productKind: "subscription" })).toBeNull();
    expect(canGrantByHand({ ...base, productKind: "one_time" })).toBeNull();
    expect(canGrantByHand({ ...base, productKind: "token" })).toBe(
      "notAGrantProduct",
    );
    expect(canGrantByHand({ ...base, productKind: null })).toBe(
      "unknownProduct",
    );
  });
});
