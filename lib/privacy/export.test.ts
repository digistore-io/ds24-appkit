// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The guard that keeps the two subject-access exports saying the same thing.
//
// There are two, on purpose (`lib/privacy/export.ts` explains why): the
// operator's command answers "what do you hold about this address", the
// member's download answers "what do you hold about me". They differ in exactly
// one documented way — the raw webhook bodies are not in the self-service file,
// because they can carry other people's data and nobody is in between to redact
// them (Art. 15(4)).
//
// **The failure this test exists for is not that difference. It is drift.**
// Somebody adds a table, updates whichever export they happened to be looking
// at, and the other one quietly starts answering a legal request incompletely.
// Nothing breaks, no page errors, and the gap surfaces the day a regulator asks
// why two answers about the same person disagree.
//
// Same shape as `lib/ai/providers/leak-guard.test.ts`: a rule nobody can be
// expected to remember, enforced by something that reads the tree.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { MEMBER_EXPORT_SECTIONS, DELIBERATELY_NOT_SELF_SERVICE } from "./export";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COMMAND = join("scripts", "privacy", "export-data.mjs");
const command = readFileSync(join(ROOT, COMMAND), "utf8");

/**
 * The sections of the operator's report.
 *
 * Read out of the `const report = { … }` literal rather than by running it —
 * the script opens a database connection at import time, and a test that needed
 * Postgres would be a test nobody runs.
 */
function commandSections(): string[] {
  const start = command.indexOf("const report = {");
  expect(start, `no 'const report = {' in ${COMMAND}`).toBeGreaterThan(-1);

  const body = command.slice(start);
  const end = body.indexOf("\n  };");
  expect(end, `could not find the end of the report literal`).toBeGreaterThan(-1);

  const literal = body.slice(0, end);

  // Top-level keys only: two spaces of indentation inside the literal. Nested
  // keys (everything under `aboutThisFile`) are indented further and are prose
  // about the file rather than sections of it.
  const keys = [...literal.matchAll(/^ {4}(\w+)[,:]/gm)].map((match) => match[1]);

  // `subject`, `generatedAt` and `aboutThisFile` are the envelope, not data.
  return keys.filter(
    (key) => !["subject", "generatedAt", "aboutThisFile"].includes(key),
  );
}

describe("the two exports cover the same tables", () => {
  it("reads a plausible section list out of the command", () => {
    // Non-vacuity: a regex that matched nothing would make every assertion
    // below pass against an empty list.
    const sections = commandSections();
    expect(sections.length).toBeGreaterThan(8);
    expect(sections).toContain("orders");
    expect(sections).toContain("chatMessages");
  });

  it("the member's export omits only what is documented as omitted", () => {
    const missing = commandSections().filter(
      (section) =>
        !MEMBER_EXPORT_SECTIONS.includes(section as never) &&
        !DELIBERATELY_NOT_SELF_SERVICE.includes(section as never),
    );

    expect(
      missing,
      `these sections are in ${COMMAND} but not in the member's own download. ` +
        `Either add them to MEMBER_EXPORT_SECTIONS (and to the query in ` +
        `lib/privacy/export.ts), or add them to DELIBERATELY_NOT_SELF_SERVICE ` +
        `with a comment saying why a person may not have their own copy — ` +
        `"we forgot" is not one of the reasons Art. 15 accepts.`,
    ).toEqual([]);
  });

  it("the command has everything the member's export has", () => {
    const sections = commandSections();
    const missing = MEMBER_EXPORT_SECTIONS.filter(
      (section) => !sections.includes(section),
    );

    expect(
      missing,
      `these sections are in the member's own download but not in ${COMMAND}. ` +
        `The operator's answer to a subject access request must not be the ` +
        `smaller of the two — it is the one that goes to a regulator.`,
    ).toEqual([]);
  });

  it("every documented omission is real", () => {
    // Stops the exclusion list becoming a graveyard: an entry naming a section
    // the command no longer has is a comment explaining a decision nobody is
    // making any more.
    const sections = commandSections();
    for (const omitted of DELIBERATELY_NOT_SELF_SERVICE) {
      expect(
        sections,
        `DELIBERATELY_NOT_SELF_SERVICE names "${omitted}", which ${COMMAND} ` +
          `does not export either. Remove it.`,
      ).toContain(omitted);
    }
  });
});

describe("both exports carry the conversation a turn belongs to", () => {
  // ── Why this describe exists at all ──────────────────────────────────────
  // The parity check above compares section NAMES. A column added to one export
  // and forgotten in the other passes it silently — both files still have a
  // "chat messages" section, and both are still listed. So a companion's turns
  // would reach one answer differentiated and the other as an undifferentiated
  // heap, and nothing would say so.
  //
  // Matched as COLUMN REFERENCES, following this file's own precedent: the
  // prose above each query names the thing, and a guard that grepped for the
  // bare word would fail on its own documentation.
  const module = readFileSync(join(ROOT, "lib", "privacy", "export.ts"), "utf8");
  const command = readFileSync(join(ROOT, "scripts", "privacy", "export-data.mjs"), "utf8");

  it("read both files", () => {
    // Non-vacuity: without this, a wrong path makes both assertions below pass.
    expect(module.length).toBeGreaterThan(1000);
    expect(command.length).toBeGreaterThan(1000);
  });

  it("the member's own download names conversationId in its chat select", () => {
    expect(module).toMatch(/conversationId:\s*chatMessages\.conversationId/);
  });

  it("the operator's command names conversation_id in its chat query", () => {
    expect(command).toMatch(/select[^;]*\bconversation_id\b[^;]*from chat_messages/);
  });
});

describe("deleting the account still removes the transcripts", () => {
  // No code was needed for this and that is exactly why it is asserted: the
  // companion's turns are rows in `chat_messages`, so the cascade that already
  // existed removes them. The day somebody changes it to `set null` — the
  // treatment the FINANCIAL tables get, and a reasonable-looking edit — a
  // deleted customer's own words would survive their deletion.
  const schema = readFileSync(join(ROOT, "db", "schema-chat.ts"), "utf8");

  it("chat_messages still cascades from the member", () => {
    expect(schema.length).toBeGreaterThan(500);
    expect(schema).toMatch(/references\(\(\)\s*=>\s*users\.id,\s*\{\s*onDelete:\s*"cascade"\s*\}\)/);
  });

  it("and there is no second table for a companion's turns", () => {
    // A second table would need its own cascade, its own export section and its
    // own deletion path — four places for one requirement to go half-done.
    expect(schema).not.toMatch(/pgTable\(\s*"companion/);
  });
});

describe("what the member's export must never contain", () => {
  const source = readFileSync(join(ROOT, "lib", "privacy", "export.ts"), "utf8");

  // Matched as COLUMN REFERENCES (`users.passwordHash`), not as bare words.
  // The file explains in prose what it leaves out and why, and a check that
  // grepped for the word alone would fail on its own documentation — which is
  // how a guard gets deleted as "flaky" rather than fixed.
  it("does not select the password hash", () => {
    // Handing somebody a credential creates risk rather than satisfying a
    // right — and scrypt is one-way, so the value would be useless to them and
    // useful to whoever else read the file.
    expect(source).not.toMatch(/users\.passwordHash/);
  });

  it("does not select OAuth tokens", () => {
    // `accounts` holds access and refresh tokens for the sign-in provider.
    // Those are credentials for somebody else's service, not information about
    // this person.
    expect(source).not.toMatch(/accounts\.(access_token|refresh_token|id_token)/);
  });

  it("does not query the raw webhook payloads", () => {
    // `.from(ipnEvents)` — the table is named in the prose above it, which is
    // the point of matching the query rather than the word.
    expect(source).not.toMatch(/from\(ipnEvents\)/);
    expect(source).not.toMatch(/import[\s\S]*?\bipnEvents\b[\s\S]*?from "@\/db\/schema"/);
  });
});

describe("learning performance in the answer", () => {
  it("activity_results still cascades from the member — member_id specifically", () => {
    const schema = readFileSync(
      new URL("../../db/schema-learning.ts", import.meta.url),
      "utf8",
    );
    // Pin the CASCADING column by name: a second users-reference added to the
    // file must not let this pass while member_id loses its cascade.
    expect(schema).toMatch(
      /member_id"\)\s*\.notNull\(\)\s*\.references\(\(\)\s*=>\s*users\.id,\s*\{\s*onDelete:\s*"cascade"\s*\}\)/,
    );
  });

  it("both exports select the same activity_results columns — §8b's whole list", () => {
    // The section-parity test cannot see a column dropped from ONE export.
    const columns = [
      ["activityId", "activity_id"],
      ["subject", "subject"],
      ["state", "state"],
      ["score", "score"],
      ["maxScore", "max_score"],
      ["passed", "passed"],
      ["attempts", "attempts"],
      ["startedAt", "started_at"],
      ["updatedAt", "updated_at"],
      ["completedAt", "completed_at"],
    ];
    const ts = readFileSync(new URL("./export.ts", import.meta.url), "utf8");
    const tsSection = ts.slice(ts.indexOf("Learning performance"), ts.indexOf(".from(activityResults)"));
    const mjs = readFileSync(new URL("../../scripts/privacy/export-data.mjs", import.meta.url), "utf8");
    const mjsLine = mjs.slice(mjs.indexOf("from activity_results") - 400, mjs.indexOf("from activity_results"));
    for (const [camel, snake] of columns) {
      expect(tsSection, `export.ts: ${camel}`).toContain(camel);
      expect(mjsLine, `export-data.mjs: ${snake}`).toContain(snake);
    }
  });
});
