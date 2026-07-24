// Two things story 3.5 (AC 5) promises the Member, and neither is testable by
// asserting a return value — both are properties of what the code IMPORTS and
// RENDERS. So they are asserted on the source, the same way
// ./instructions.test.ts asserts the instruction layer: a rule that lives only
// in a comment is a rule the next edit reverses without noticing.
//
//   1. The Operator's REASON never reaches the customer it is about.
//      `grants.note` and `tokenLedger.note` hold what an Operator typed for a
//      support colleague — "comped, angry on the phone", "goodwill, do not
//      repeat". docs/entitlements.md separately teaches App developers
//      `consumeTokens({ …, note: "report" })`, i.e. `note` doubles as a
//      Member-MEANINGFUL label, which is exactly what makes a future
//      Member-facing history feel safe to build out of it. It is not.
//
//   2. Nothing about an adjustment or a hand-issued grant sends mail.
//      This is already true — the only mail path in the app is the Auth.js
//      magic link. The risk is structural: Epic 3's actions live in the same
//      directory as `sendLoginLinkAction`, which is the blueprint every admin
//      action is copied from, and "notify the member" is a one-line addition
//      to a file that already has the import three functions above.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** The app root (this file sits in lib/entitlements/). */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Every file that renders to a MEMBER and touches entitlements or the balance.
 *
 * Listed rather than discovered, and that is the trade: discovery would cover a
 * new page for free but cannot tell a Member surface from an Operator one, and
 * the Operator's page legitimately renders `note`. A new Member-facing surface
 * therefore has to be added here by hand — the "covers what it claims to"
 * assertion below at least makes an empty list impossible.
 */
const MEMBER_SURFACES = [
  join("app", "dashboard", "account", "page.tsx"),
  join("app", "dashboard", "page.tsx"),
];

/** The Operator's reads. Rich by design; forbidden on the surfaces above. */
const OPERATOR_READS = ["listGrantsFor", "listLedgerFor", "findUser"];

/** Server actions of Epic 3 — the balance correction, the grant, the revoke. */
const EPIC_3_ACTIONS = [
  join("app", "dashboard", "admin", "users", "[id]", "actions.ts"),
];

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

/**
 * The file with its comments taken out — what actually RUNS.
 *
 * Load-bearing, not tidiness. The account page explains at length WHY it
 * renders no `note`, and every one of those sentences contains the word; a
 * scan of the raw source fails on the very comment that documents the rule,
 * which would teach the next person to delete the explanation.
 *
 * `/* … *\/` first (that also covers JSX's `{/* … *\/}`), then `//` to end of
 * line — but not `://`, so a URL in a comment cannot swallow the rest of its
 * line and hide a real call behind it.
 */
function code(relPath: string): string {
  return read(relPath)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("the Member never sees the Operator's reason", () => {
  it("covers the surfaces it claims to", () => {
    // Without this, a rename turns every assertion below into a loop over an
    // empty array that passes forever.
    expect(MEMBER_SURFACES.length).toBeGreaterThan(0);
    for (const relPath of MEMBER_SURFACES) {
      expect(existsSync(join(ROOT, relPath)), `${relPath} is missing`).toBe(
        true,
      );
    }
  });

  for (const relPath of MEMBER_SURFACES) {
    it(`${relPath}: renders no note and no issuedBy`, () => {
      const source = code(relPath);
      // `.note` / `note:` / `note}` — the shapes a render actually takes. Not a
      // bare word match: this file's own prose says "note" repeatedly, and so
      // do the comments on the page explaining why it must not appear.
      const renders = [/\.\s*note\b/, /\bnote\s*[:}]/, /\bissuedBy\b/].filter(
        (re) => re.test(source),
      );
      expect(
        renders.map(String),
        `${relPath} touches an Operator-written note. grants.note and\n` +
          `tokenLedger.note hold what an Operator typed ABOUT this customer, for a\n` +
          `colleague — never for the customer. Read entitlementsFor() /\n` +
          `suspendedKeysFor() / getTokenAccount(), which carry no note at all.`,
      ).toEqual([]);
    });

    it(`${relPath}: does not use the Operator's readers`, () => {
      const used = OPERATOR_READS.filter((name) =>
        new RegExp(`\\b${name}\\s*\\(`).test(code(relPath)),
      );
      expect(
        used,
        `${relPath} calls an Operator read. Those return note and issuedBy, and a\n` +
          `shape shared between the two surfaces is one careless spread away from\n` +
          `the leak.`,
      ).toEqual([]);
    });
  }
});

describe("no Adjustment or manual Grant notifies the Member", () => {
  it("covers the actions it claims to", () => {
    expect(EPIC_3_ACTIONS.length).toBeGreaterThan(0);
    for (const relPath of EPIC_3_ACTIONS) {
      expect(existsSync(join(ROOT, relPath)), `${relPath} is missing`).toBe(
        true,
      );
    }
  });

  for (const relPath of EPIC_3_ACTIONS) {
    it(`${relPath}: imports neither the mailer nor signIn`, () => {
      const source = code(relPath);
      const found: string[] = [];
      // Static and dynamic import alike — sendLoginLinkAction reaches for
      // `await import("@/auth")` precisely because a top-level one would drag
      // the mailer into places it does not belong, so matching only `import …
      // from` would miss the shape actually copied.
      if (/["']@\/lib\/email["']/.test(source)) found.push("@/lib/email");
      if (/\bsignIn\b/.test(source)) found.push("signIn");
      if (/\bsendMail\b|\bsendLoginLink/.test(source)) found.push("a mail call");

      expect(
        found,
        `${relPath} can send mail. AC 5 of story 3.5: a balance correction and a\n` +
          `hand-issued grant are support actions, and the Member is told about\n` +
          `them by their account page — not by an email whose subject line would\n` +
          `have to explain a correction they never asked about. The only mail path\n` +
          `in this app is the Auth.js magic link, and it stays that way.`,
      ).toEqual([]);
    });
  }
});

// The render-side scan above catches `{row.note}` and misses `{row["note"]}`,
// `{...row}`, `{JSON.stringify(row)}` and `Object.values(row)` — verified by
// injecting all five. Widening the regexes is a losing race; guard the READER
// instead. If the shape the Member's page receives has no operator-written
// column on it, none of those five can leak anything, whatever the render does.
//
// This is what makes the page's own "structural, not a promise" comment true.
// It is true today because the projections are narrow — and nothing asserted
// that until now, so the first story to widen `Entitlement` would have killed
// the argument silently.
describe("the Member's readers project no operator-written column", () => {
  it("Entitlement carries no note and no issuedBy", () => {
    const src = readFileSync(
      join(ROOT, "lib", "entitlements", "manage.ts"),
      "utf8",
    );
    const start = src.indexOf("export interface Entitlement");
    const body = src.slice(start, src.indexOf("}", start));
    expect(body).not.toMatch(/\bnote\b|\bissuedBy\b/);
  });

  it("and the projection it actually runs selects neither", async () => {
    const { db } = await import("@/db");
    const { grants } = await import("@/db/schema");
    const { ENTITLEMENT_COLUMNS, activeFor } = await import("./manage");
    const { sql } = db
      .selectDistinctOn([grants.productKey], ENTITLEMENT_COLUMNS)
      .from(grants)
      .where(activeFor("m"))
      .toSQL();
    expect(sql).not.toMatch(/"note"|"issued_by"/);
    // ...and it does carry the column story 3.5 added, asserted against the
    // SHIPPED projection rather than one the test wrote itself.
    expect(sql).toContain('"access_until"');
  });
});
