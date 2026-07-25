// The instruction layer is part of the contract, so it is tested like one.
//
// `CLAUDE.md`, the skills under `.claude/skills/` and the files in `docs/` are
// what an AI agent reads before it builds a feature. If one of them says "tie
// access to orders.status", every app built afterwards gates the wrong way —
// and nothing in the test suite notices, because documentation is the one part
// of a repository that nothing asserts.
//
// That is the same reasoning `shouldCreditTokens` in
// lib/digistore/attribution.ts gives for existing as a pure function: a money
// rule that lives only in prose is a rule a future edit can quietly reverse.
//
// TWO rules, and both directions matter:
//
//   1. NEGATIVE — no instruction may point an access decision at a billing
//      table. `orders` is the financial record and `subscriptions` mirrors what
//      Digistore24 believes; neither answers "may this person use this". A
//      cancelled subscription carries `status = 'cancelled'` while access
//      legitimately continues to the end of the paid period, so a doc that says
//      "gate on the status" documents a bug.
//   2. POSITIVE — the core files must keep NAMING the API that replaces it.
//      "Never do X" with no "do Y instead" is an instruction an agent works
//      around; deleting the guidance must fail just as loudly as reversing it.
//
// Legitimate mentions exist — the subscription self-service DISPLAYS
// `subscriptions.status`, and this file's own doc explains why the tables are
// the wrong source. Those carry the literal marker `not-an-access-check` on the
// same line. Same line, not "somewhere above": a window would silently bless
// the next line somebody adds under it.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

/** The app root (this file sits in lib/entitlements/). */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const SKILLS_DIR = join(ROOT, ".claude", "skills");
const DOCS_DIR = join(ROOT, "docs");

/** Directory listing that yields [] instead of throwing on a missing folder. */
function entries(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/**
 * Every file an agent reads as instruction, relative to the app root.
 *
 * DISCOVERED, not typed out: a new skill or a new doc is covered the moment it
 * exists, which is a zero-line change rather than a one-line one. The price is
 * that a broken glob would make this whole suite vacuous — so
 * "covers the files that matter" below asserts the discovery actually found
 * them.
 */
export const INSTRUCTION_FILES: string[] = [
  "CLAUDE.md",
  "README.md",
  ...entries(SKILLS_DIR)
    .map((name) => join(".claude", "skills", name, "SKILL.md"))
    .filter((p) => existsSync(join(ROOT, p))),
  ...entries(DOCS_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs", name)),
].filter((p) => existsSync(join(ROOT, p)));

/**
 * A status column of a billing table, in the shapes markdown actually uses:
 * `orders.status`, `` `orders.status` ``, `` `orders` status ``.
 *
 * Deliberately NOT matching the singular prose "the order status" — the
 * instruction to write that status only from IPN events is correct and has
 * nothing to do with reading it. Deliberately not matching `orders.memberId`
 * either: attribution is a different rule with its own guidance, and folding it
 * in here would produce noise that teaches people to ignore the failure.
 */
const BILLING_STATUS: RegExp[] = [
  // orders.status, `orders`.status, ordersTable.status
  /\b(orders?|subscriptions?)(_?table)?\b`?\s*\.\s*`?status\b/gi,
  // Deliberately NOT a loose "orders … status within 40 chars" pair. That
  // shape flags every legitimate WRITE rule ("set the order status only
  // through IPN events") and every display line, so every one of them would
  // need a marker — and a guard that demands markers everywhere trains people
  // to add markers, which is how it stops guarding. The gating shapes below
  // carry that weight instead, and they cannot be marked away.
  // SQL: FROM orders … WHERE status
  /\bfrom\s+`?(orders|subscriptions)`?\b[\s\S]{0,80}?\bstatus\b/gi,
  // the aliases a hand-written query reaches for
  /\bbilling[_]?status\b/gi,
];

/** The three table names, bare. Only ever used INSIDE `TABLE` below. */
const TABLE_NAME = "(?:orders|subscriptions|grants)";

/** A name boundary that also accepts the opening backtick this repo writes. */
const NAME_START = "(?:`|\\b)";
/** …and the closing one. */
const NAME_END = "(?:`|\\b)";

/**
 * One of those names WRITTEN AS A TABLE — not as an English word that happens
 * to be spelled the same.
 *
 * THE EVIDENCE IS REQUIRED, and that is the whole point of this constant.
 * `grants` is also an ordinary verb and an ordinary plural noun: "the Operator
 * grants a plan, and it unlocks the feature", "the page lists the Member's
 * grants". A bare word standing next to `unlock` proves nothing about what the
 * sentence tells an agent to READ — and the rule below cannot be marked away,
 * so a false positive there leaves no fix except deleting a correct sentence.
 *
 * That is not a hypothetical: every sentence above is one the admin surface has
 * to be described in, and each of them tripped the earlier shape, which asked
 * only for the bare name with OPTIONAL backticks. A guard that forbids correct
 * prose gets worked around, and a worked-around guard has stopped guarding —
 * the same reasoning `BILLING_STATUS` gives for refusing the loose
 * "orders … status within 40 chars" pair.
 *
 * Each alternative is a shape that cannot be read as prose:
 */
const TABLE = [
  // `grants` · `orders.status` — backticked is how this repo names a table
  "`" + TABLE_NAME + "(?:\\.\\w+)?`",
  // orders.status, `orders`.status — a dotted column is unambiguously a table
  NAME_START + TABLE_NAME + "`?\\s*\\.\\s*`?\\w",
  // "the grants table", "the `orders` table"
  NAME_START + TABLE_NAME + "`?\\s+table\\b",
  // "rows in grants", "records from `orders`"
  "\\b(?:rows?|records?|entries|columns?)\\s+(?:in|of|from)\\s+" +
    NAME_START +
    TABLE_NAME +
    NAME_END,
  // SQL, where the name is a table by grammar
  "\\b(?:from|join|into|update)\\s+" + NAME_START + TABLE_NAME + NAME_END,
].join("|");

/** What a sentence has to be DOING to the table for this to be a gate. */
const GATES = "gate|gating|unlock|unlocks|decides? access|entitle[sd]?";
/**
 * The same list minus `entitle[sd]?`, for the table-first direction. "the
 * `grants` table … entitled" is a sentence about provenance, not an
 * instruction; "gate on it" is the shape that matters when the table leads.
 */
const GATES_AFTER = "gate|gating|unlock|unlocks|decides? access";

/**
 * A billing table named as the thing an access decision READS.
 *
 * These are NEVER exemptible, and that is the whole point of splitting them
 * out. A `not-an-access-check:` marker says "I am merely mentioning this
 * column" — a defensible claim about a display line. It cannot be a defensible
 * claim about a sentence that says "gate on it": the marker would then be a
 * way to write the forbidden instruction and bless it in the same breath, and
 * the fix path for a red test becomes "append the marker" instead of "fix the
 * instruction".
 *
 * `grants` belongs here alongside the billing tables. Read directly it
 * bypasses `activeFor()` and hands access to suspended and ended grants —
 * which is worse than reading `orders`, not better.
 *
 * "the access-gate rule" below asserts BOTH halves: the abuse cases stay red,
 * and the admin surface's own vocabulary stays green. Narrowing this without
 * that second half is how the first version got it wrong.
 */
const ACCESS_GATE: RegExp[] = [
  new RegExp(`\\b(?:${GATES})\\b[^.\\n]{0,80}(?:${TABLE})`, "gi"),
  new RegExp(`(?:${TABLE})[^.\\n]{0,80}\\b(?:${GATES_AFTER})\\b`, "gi"),
];

/**
 * The opt-out. Put it on the SAME line as the mention, with a reason:
 *
 *   | **Status** | `subscriptions.status` … | <!-- not-an-access-check: display -->
 *
 * It is a claim the author makes on the record, not a way to switch the rule
 * off — anything gating on it is still wrong, it just is not this test's job to
 * tell prose apart from intent.
 */
const EXEMPT = "not-an-access-check";
/** The marker only counts WITH a reason: `not-an-access-check: why`. */
const EXEMPT_RE = /not-an-access-check:\s*\S/;

/** The API that answers the question instead. */
const ENTITLEMENT_API = /\b(hasPlan|entitlementsFor)\s*\(\s*\w/;

/** Files that must keep pointing an agent at the entitlement API. */
const MUST_TEACH_THE_API = [
  "CLAUDE.md",
  join(".claude", "skills", "build-app", "SKILL.md"),
  join(".claude", "skills", "guardrails", "SKILL.md"),
  // AC 3 names these two as well, and security-gateway is the skill that
  // declares a hand-rolled orders query "a finding" — it has to name the
  // alternative itself, or the audit tells an agent what NOT to do and leaves
  // it to invent a third thing.
  join(".claude", "skills", "security-gateway", "SKILL.md"),
  join(".claude", "skills", "billing-modes", "SKILL.md"),
  join("docs", "entitlements.md"),
];

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

/** Unmarked billing-status mentions as "line N: <text>". */
function unmarkedMentions(source: string): string[] {
  return source.split("\n").flatMap((line, i) => {
    const test = (res: RegExp[]) =>
      res.some((re) => {
        re.lastIndex = 0;
        return re.test(line);
      });
    // A gating instruction can never be marked away — see ACCESS_GATE.
    if (test(ACCESS_GATE)) return [`line ${i + 1}: ${line.trim()}`];
    // A bare mention can, but only WITH a reason: a naked marker, or
    // `not-an-access-checklist`, used to pass.
    if (EXEMPT_RE.test(line)) return [];
    return test(BILLING_STATUS) ? [`line ${i + 1}: ${line.trim()}`] : [];
  });
}

describe("instruction layer", () => {
  it("covers the files that matter", () => {
    // Without this, a rename under .claude/skills/ turns every assertion below
    // into a loop over an empty array that passes forever.
    for (const expected of [
      "CLAUDE.md",
      join(".claude", "skills", "build-app", "SKILL.md"),
      join(".claude", "skills", "billing-modes", "SKILL.md"),
      join(".claude", "skills", "guardrails", "SKILL.md"),
      join(".claude", "skills", "security-gateway", "SKILL.md"),
      join("docs", "entitlements.md"),
      join("docs", "digistore-billing-modes.md"),
    ]) {
      expect(INSTRUCTION_FILES, `${expected} is not being checked`).toContain(
        expected,
      );
    }
  });

  for (const relPath of INSTRUCTION_FILES) {
    it(`${relPath}: does not gate access on a billing table`, () => {
      expect(
        unmarkedMentions(read(relPath)),
        `${relPath} points an access decision at a billing table.\n` +
          `Access comes from lib/entitlements/manage.ts — hasPlan(memberId, productKey)\n` +
          `for one feature, entitlementsFor(memberId) for the list. If the mention is\n` +
          `NOT an access rule (display, or an explanation of the internals), say so on\n` +
          `the same line with the marker "${EXEMPT}: <reason>".`,
      ).toEqual([]);
    });
  }

  for (const relPath of MUST_TEACH_THE_API) {
    it(`${relPath}: names the entitlement API`, () => {
      // The other half of the rule. A "never gate on orders.status" left alone,
      // with nothing to do instead, is how an agent ends up inventing a third
      // thing.
      expect(
        ENTITLEMENT_API.test(read(relPath)),
        `${relPath} no longer mentions hasPlan/entitlementsFor — an agent reading it\n` +
          `has no supported way to answer "may this Member use this".`,
      ).toBe(true);
    });
  }
});

// The guard, guarded. Until this block the rules were asserted only against the
// repo's own files — which pass, and would go on passing if the regexes were
// narrowed to nothing. Both directions are pinned here instead:
//
//   RED  — the four shapes a doc pass must never be able to ship, including
//          the one that tries to buy its way out with a marker.
//   GREEN— the sentences the Operator's tools have to be described in. Three of
//          them were flagged before the `TABLE` shapes above existed, and the
//          only fix a red build offers for an unexemptible rule is to delete
//          the sentence.
//
// These strings live in a TEST file on purpose: INSTRUCTION_FILES discovers
// `CLAUDE.md`, `README.md`, `.claude/skills/*/SKILL.md` and `docs/*.md`, so a
// fixture written in any of those would be scanned as if somebody meant it.
describe("the access-gate rule", () => {
  const flagged = (line: string) => unmarkedMentions(line).length > 0;

  it("refuses an instruction that points access at a billing table", () => {
    expect(flagged("- Gate the paid feature on `orders`.")).toBe(true);
  });

  it("cannot be bought off with a marker", () => {
    // The marker is a claim that a mention is only a mention. It is not
    // available to a sentence that says "gate on it" — otherwise the fix path
    // for a red build becomes "append the marker".
    expect(
      flagged(
        "- Gate the paid feature on `orders`. <!-- not-an-access-check: pretty please -->",
      ),
    ).toBe(true);
  });

  it("refuses reading the grants table directly", () => {
    // Worse than reading `orders`, not better: it bypasses activeFor() and
    // hands access to suspended and ended grants.
    expect(flagged("- Read the `grants` table directly to decide access.")).toBe(
      true,
    );
  });

  it("still catches SQL and column shapes without backticks", () => {
    expect(flagged("Gate the export on orders.status.")).toBe(true);
    expect(flagged("select * from subscriptions to decide access")).toBe(true);
    expect(flagged("Rows in grants unlock the feature.")).toBe(true);
  });

  it("leaves the Operator's own vocabulary alone", () => {
    for (const line of [
      "The Operator grants a plan by hand and it unlocks the feature immediately.",
      "The Member detail page lists the Member's grants and what unlocks them.",
      "Balance adjustments never gate access; grants do.",
      "A manual grant unlocks exactly the same features as a purchase.",
    ]) {
      expect(unmarkedMentions(line), line).toEqual([]);
    }
  });
});

describe("MUST_TEACH_THE_API", () => {
  it("is not satisfied by prose that merely names the function", () => {
    // The positive half. A file reduced to "never use hasPlan" tells an agent
    // what NOT to do and leaves it to invent a third thing — so the rule asks
    // for a CALL WITH AN ARGUMENT, and rewriting `hasPlan(memberId, key)` into
    // a sentence fails the suite on purpose.
    expect(ENTITLEMENT_API.test("Never use hasPlan for anything.")).toBe(false);
    expect(ENTITLEMENT_API.test("hasPlan(memberId, productKey)")).toBe(true);
  });
});

describe("INSTRUCTION_FILES", () => {
  it("holds paths relative to the app root", () => {
    for (const relPath of INSTRUCTION_FILES) {
      expect(relative(ROOT, join(ROOT, relPath))).toBe(relPath);
      expect(existsSync(join(ROOT, relPath))).toBe(true);
    }
  });
});

// ── The token-debit API (epic 5) ───────────────────────────────────────────
//
// Same rule as above, applied to the second API this layer teaches. `hasPlan`
// answers "may they"; `spendTokens` answers "can they afford this one". A
// balance is not an entitlement, so neither substitutes for the other, and an
// agent that finds only the first meters usage by hand.
//
// POSITIVE by design: without this, deleting the sections added in story 5.1
// fails nothing, and AD-9 makes them part of the contract.
const SPEND_API = /\bspendTokens\s*\(/;

/** Files that must keep naming the debit API. */
const MUST_TEACH_THE_SPEND_API = [
  "CLAUDE.md",
  join(".claude", "skills", "build-app", "SKILL.md"),
  join(".claude", "skills", "billing-modes", "SKILL.md"),
  join("docs", "digistore-billing-modes.md"),
  join("docs", "entitlements.md"),
];

/**
 * The ordering rule. Work-before-check is the mistake that costs money.
 *
 * The NAME, not a call: the docs name it in prose ("gate on
 * `hasSufficientBalance` before starting") as well as in code, and both are
 * legitimate ways to teach it. What must not happen is a file that shows
 * `spendTokens` and never mentions the check at all.
 */
const CHECK_BEFORE_WORK = /hasSufficientBalance/;

describe("the instruction layer teaches the token debit", () => {
  for (const relPath of MUST_TEACH_THE_SPEND_API) {
    it(`${relPath}: names spendTokens`, () => {
      expect(
        SPEND_API.test(read(relPath)),
        `${relPath} no longer names spendTokens(). An agent metering usage will\n` +
          `then reach for consumeTokens({ memberId }) — which takes an id, and an\n` +
          `id out of a FormData drains another customer's balance — or write\n` +
          `balance arithmetic by hand.`,
      ).toBe(true);
    });

    it(`${relPath}: shows the balance check that must come first`, () => {
      expect(
        CHECK_BEFORE_WORK.test(read(relPath)),
        `${relPath} teaches spendTokens() without hasSufficientBalance(). Order\n` +
          `is check -> work -> charge: doing the work with no check in front hands\n` +
          `the result to somebody who cannot pay, because by the time spendTokens\n` +
          `throws the expensive part has already run.`,
      ).toBe(true);
    });
  }

  // Deliberately NOT asserted here: "no file shows a hand-written balance
  // decrement". Every regex for it also matches `const balance = …` and, worse,
  // matches build-app's own sentence FORBIDDING `balance = balance - n` — so
  // the test would fail on the instruction that states the rule, and the way to
  // make it pass would be to delete that instruction. The positive assertions
  // above cover the same ground the right way round: name the API that replaces
  // it, in every file that has cause to.
});
