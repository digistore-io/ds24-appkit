import { describe, it, expect } from "vitest";
import {
  decideAdjustment,
  clampThreshold,
  defaultReloadThreshold,
  MAX_TOKEN_AMOUNT,
  TOKEN_ERROR_CODES,
  TokenError,
} from "./rules";

const operator = { id: "op1", role: "owner" };
const customer = { id: "u3", role: "member" };

/** Shorthand: the happy-path shape with one field varied. */
function decide(over: Partial<Parameters<typeof decideAdjustment>[0]> = {}) {
  return decideAdjustment({
    actor: operator,
    balance: 100,
    amount: "50",
    reason: "support case #42",
    ...over,
  });
}

describe("decideAdjustment — who may", () => {
  it("lets an Operator adjust", () => {
    expect(decide()).toEqual({
      ok: true,
      delta: 50,
      reason: "support case #42",
      balanceAfter: 150,
    });
  });

  it("refuses a member — the action is an HTTP endpoint of its own", () => {
    expect(decide({ actor: customer })).toEqual({ ok: false, code: "notOwner" });
  });

  // AC 5: there is deliberately NO self-guard. An Operator may correct their
  // own balance; lib/users/rules.ts's selfDelete/selfDemote/selfBlock shape
  // does NOT carry over here.
  it("lets an Operator adjust their OWN balance (no self-guard)", () => {
    const result = decideAdjustment({
      actor: operator,
      balance: 10,
      amount: "5",
      reason: "my own test purchase",
    });
    expect(result).toEqual({
      ok: true,
      delta: 5,
      reason: "my own test purchase",
      balanceAfter: 15,
    });
  });
});

describe("decideAdjustment — the reason is mandatory (AC 2)", () => {
  // The HTML `required` attribute is NOT the refusal: a server action is an
  // HTTP endpoint and can be called without ever rendering the form.
  it("refuses a missing reason", () => {
    expect(decide({ reason: null })).toEqual({ ok: false, code: "emptyReason" });
    expect(decide({ reason: undefined })).toEqual({
      ok: false,
      code: "emptyReason",
    });
  });

  it("refuses an empty or blank reason", () => {
    expect(decide({ reason: "" })).toEqual({ ok: false, code: "emptyReason" });
    expect(decide({ reason: "   \t\n " })).toEqual({
      ok: false,
      code: "emptyReason",
    });
  });

  it("refuses a non-string reason", () => {
    expect(decide({ reason: 42 })).toEqual({ ok: false, code: "emptyReason" });
  });

  it("stores the reason trimmed", () => {
    const result = decide({ reason: "  refund goodwill  " });
    expect(result).toEqual({
      ok: true,
      delta: 50,
      reason: "refund goodwill",
      balanceAfter: 150,
    });
  });
});

describe("decideAdjustment — the amount (AC 4)", () => {
  // FormData yields STRINGS, and every convenient parser lies about one of
  // these: Number("") is 0, Number("abc") is NaN, parseInt("5 tokens") is 5.
  it("refuses an empty amount rather than reading it as 0", () => {
    expect(decide({ amount: "" })).toEqual({ ok: false, code: "invalidAmount" });
  });

  it("refuses text", () => {
    expect(decide({ amount: "abc" })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
  });

  it("refuses a number with a trailing word (parseInt would take the 5)", () => {
    expect(decide({ amount: "5 tokens" })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
  });

  it("refuses missing input", () => {
    expect(decide({ amount: null })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
    expect(decide({ amount: undefined })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
  });

  it("refuses a fraction — `amount` is a Postgres integer", () => {
    expect(decide({ amount: "1.5" })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
    expect(decide({ amount: 1.5 })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
  });

  it("refuses exponent and hex notation", () => {
    expect(decide({ amount: "1e3" })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
    expect(decide({ amount: "0x10" })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
  });

  it("refuses Infinity and NaN", () => {
    expect(decide({ amount: Infinity })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
    expect(decide({ amount: NaN })).toEqual({
      ok: false,
      code: "invalidAmount",
    });
  });

  it("accepts a plain number as well as a string", () => {
    expect(decide({ amount: 50 })).toMatchObject({ ok: true, delta: 50 });
  });

  it("accepts whitespace around the digits and an explicit plus", () => {
    expect(decide({ amount: " +50 " })).toMatchObject({ ok: true, delta: 50 });
  });

  it("refuses zero — it is not a correction", () => {
    expect(decide({ amount: "0" })).toEqual({ ok: false, code: "zeroAmount" });
    expect(decide({ amount: "-0" })).toEqual({ ok: false, code: "zeroAmount" });
    expect(decide({ amount: 0 })).toEqual({ ok: false, code: "zeroAmount" });
  });

  it("refuses a value past the Postgres integer range", () => {
    expect(decide({ amount: String(MAX_TOKEN_AMOUNT + 1) })).toEqual({
      ok: false,
      code: "amountTooLarge",
    });
    expect(decide({ amount: "99999999999999999999" })).toEqual({
      ok: false,
      code: "amountTooLarge",
    });
    expect(decide({ amount: String(-MAX_TOKEN_AMOUNT - 1) })).toEqual({
      ok: false,
      code: "amountTooLarge",
    });
  });

  // `amount` fits, but `balance_after` would not — the same integer column,
  // and the row that would 500 is the ledger row, not the input.
  it("refuses when the RESULTING balance would overflow", () => {
    expect(
      decide({ balance: MAX_TOKEN_AMOUNT - 10, amount: "11" }),
    ).toEqual({ ok: false, code: "amountTooLarge" });
  });

  it("accepts the exact maximum", () => {
    expect(decide({ balance: 0, amount: String(MAX_TOKEN_AMOUNT) })).toEqual({
      ok: true,
      delta: MAX_TOKEN_AMOUNT,
      reason: "support case #42",
      balanceAfter: MAX_TOKEN_AMOUNT,
    });
  });
});

describe("decideAdjustment — removing tokens (AC 3)", () => {
  it("removes tokens and reports the resulting balance", () => {
    expect(decide({ balance: 100, amount: "-40" })).toEqual({
      ok: true,
      delta: -40,
      reason: "support case #42",
      balanceAfter: 60,
    });
  });

  it("refuses removing more than the balance", () => {
    expect(decide({ balance: 100, amount: "-150" })).toEqual({
      ok: false,
      code: "insufficientBalance",
    });
  });

  it("allows emptying the account exactly", () => {
    expect(decide({ balance: 100, amount: "-100" })).toMatchObject({
      ok: true,
      balanceAfter: 0,
    });
  });

  // The foot-gun §D3 names: hasSufficientBalance(balance, cost) answers false
  // for a NEGATIVE cost (account.ts:37-39). Fed the signed delta it would
  // refuse this — a legitimate credit of 150 onto a balance of 100.
  it("allows ADDING more than the current balance", () => {
    expect(decide({ balance: 100, amount: "150" })).toEqual({
      ok: true,
      delta: 150,
      reason: "support case #42",
      balanceAfter: 250,
    });
  });

  it("allows adding to an account that has nothing", () => {
    expect(decide({ balance: 0, amount: "10" })).toMatchObject({
      ok: true,
      balanceAfter: 10,
    });
  });

  it("refuses removing from an account that has nothing", () => {
    expect(decide({ balance: 0, amount: "-1" })).toEqual({
      ok: false,
      code: "insufficientBalance",
    });
  });
});

describe("decideAdjustment — order of refusals", () => {
  // Authorization first: someone who may not act must not learn from the error
  // message whether the amount would have been accepted.
  it("answers notOwner before anything about the input", () => {
    expect(
      decideAdjustment({
        actor: customer,
        balance: 0,
        amount: "nonsense",
        reason: "",
      }),
    ).toEqual({ ok: false, code: "notOwner" });
  });

  it("answers emptyReason before it looks at the amount", () => {
    expect(decide({ reason: "", amount: "nonsense" })).toEqual({
      ok: false,
      code: "emptyReason",
    });
  });
});

describe("TOKEN_ERROR_CODES", () => {
  it("is the single list the translation test walks", () => {
    expect([...TOKEN_ERROR_CODES]).toEqual([
      "notOwner",
      // Thrown by adjustTokens, not by decideAdjustment — see the list itself.
      "tokensNotSold",
      "emptyReason",
      "invalidReason",
      "invalidAmount",
      "zeroAmount",
      "amountTooLarge",
      "insufficientBalance",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(TOKEN_ERROR_CODES).size).toBe(TOKEN_ERROR_CODES.length);
  });
});

describe("TokenError", () => {
  it("carries the code as its message, for the log", () => {
    const error = new TokenError("insufficientBalance");
    expect(error.code).toBe("insufficientBalance");
    expect(error.message).toBe("insufficientBalance");
    expect(error.name).toBe("TokenError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("decideAdjustment — the reason must be readable", () => {
  const base = {
    actor: { id: "op", role: "owner" as const },
    balance: 100,
    amount: "10",
  };

  it("refuses a reason made only of invisible characters", () => {
    // `trim()` does NOT strip a zero-width space, a braille blank or a
    // zero-width joiner. Without this guard such a value passes as a reason,
    // and the journal then asserts one was given while showing an empty cell —
    // and because `note` is non-null, not even the "—" placeholder appears.
    for (const invisible of ["\u200B", "\u2800", "\u200D", "\u200B\u200D"]) {
      expect(decideAdjustment({ ...base, reason: invisible })).toEqual({
        ok: false,
        code: "emptyReason",
      });
    }
  });

  it("still accepts digits, and letters from any script", () => {
    for (const ok of ["2024", "Kulanz", "\u8865\u507F", "\u0432\u043E\u0437\u0432\u0440\u0430\u0442"]) {
      expect(decideAdjustment({ ...base, reason: ok }).ok).toBe(true);
    }
  });

  it("refuses a control character rather than letting Postgres reject it", () => {
    // A NUL is accepted by JS and rejected by Postgres, which reaches the
    // Operator as "unknown error" instead of the translated refusal AC 4
    // promises. The transaction rolls back cleanly either way — this is about
    // the message, not about the money.
    expect(decideAdjustment({ ...base, reason: "goodwill\u0000" })).toEqual({
      ok: false,
      code: "invalidReason",
    });
  });

  it("refuses an unbounded reason", () => {
    // An append-only journal pulls up to 100 of these into every render.
    expect(decideAdjustment({ ...base, reason: "x".repeat(501) })).toEqual({
      ok: false,
      code: "invalidReason",
    });
    expect(decideAdjustment({ ...base, reason: "x".repeat(500) }).ok).toBe(true);
  });
});

describe("defaultReloadThreshold", () => {
  it("is roughly a tenth of the package", () => {
    expect(defaultReloadThreshold(1000)).toBe(100);
    expect(defaultReloadThreshold(500)).toBe(50);
  });

  it("refills before empty for any package big enough to allow it", () => {
    // 0 means "top up once completely empty", and the credit arrives
    // asynchronously by IPN, so it strands the Member at zero for as long as
    // Digistore24 takes. Anything above 1 credit can do better than that.
    for (const credits of [2, 5, 9, 10]) {
      expect(defaultReloadThreshold(credits), String(credits)).toBeGreaterThan(0);
    }
  });

  it("gives up and waits for empty on a 1-credit package", () => {
    // The degenerate case, and 0 is the only honest answer: `shouldAutoReload`
    // is `balance <= threshold`, so ANY positive threshold on a 1-credit
    // package is still satisfied right after the top-up lands — one card
    // charge per token consumed until the DS24 daily cap intervenes.
    expect(defaultReloadThreshold(1)).toBe(0);
  });

  it("survives a package with a nonsense credits figure", () => {
    // A registry edit can produce these; a NaN threshold would make
    // shouldAutoReload() answer false for ever, silently.
    for (const bad of [0, -100, NaN, Infinity]) {
      expect(defaultReloadThreshold(bad), String(bad)).toBe(1);
    }
  });

  it("NEVER returns a threshold a top-up cannot climb back above", () => {
    // The invariant that matters, and the one the previous version of this test
    // failed to state: it asserted `t < Math.max(2, credits)`, which is
    // trivially true for credits <= 2 — exactly the sizes that loop. Stated
    // properly: after a successful top-up the balance is `credits`, and
    // `shouldAutoReload` must then be false, i.e. threshold < credits.
    for (const credits of [1, 2, 3, 5, 50, 1000, 25_000]) {
      const t = defaultReloadThreshold(credits);
      expect(t, `credits=${credits}`).toBeLessThan(credits);
      expect(t, `credits=${credits}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("clampThreshold", () => {
  it("caps at one below the package size", () => {
    expect(clampThreshold(500, 100)).toBe(99);
    expect(clampThreshold(100, 100)).toBe(99);
    expect(clampThreshold(50, 100)).toBe(50);
  });

  it("closes the documented misconfiguration", () => {
    // docs/digistore-billing-modes.md shows setAutoReload({ threshold: 500,
    // packageKey: "pro" }) with nothing checking that "pro" holds more than
    // 500. A later registry edit shrinking `credits` reaches the same state on
    // an already-armed account.
    expect(clampThreshold(500, 200)).toBe(199);
  });

  it("refuses nonsense rather than trusting it", () => {
    for (const [t, c] of [[NaN, 100], [-5, 100], [10, 0], [10, NaN]] as const) {
      expect(clampThreshold(t, c), `${t}/${c}`).toBe(0);
    }
  });
});
