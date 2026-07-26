// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";

import { parseAnswer, parseInline } from "./markdown";

/** The inline parts of a one-line answer — the common shape in these tests. */
function inlineOf(text: string) {
  const blocks = parseAnswer(text);
  expect(blocks).toHaveLength(1);
  const block = blocks[0];
  if (block.kind !== "paragraph") throw new Error(`expected a paragraph, got ${block.kind}`);
  expect(block.lines).toHaveLength(1);
  return block.lines[0];
}

describe("emphasis", () => {
  it("reads *one star* as emphasis", () => {
    expect(parseInline("*Übersicht*")).toEqual([{ kind: "em", text: "Übersicht" }]);
  });

  it("reads **two stars** as strong, not as emphasis around a star", () => {
    expect(parseInline("**Mein Konto**")).toEqual([{ kind: "strong", text: "Mein Konto" }]);
  });

  it("keeps the text around it", () => {
    expect(parseInline("Öffne *Mein Konto* im Menü")).toEqual([
      { kind: "text", text: "Öffne " },
      { kind: "em", text: "Mein Konto" },
      { kind: "text", text: " im Menü" },
    ]);
  });

  it("reads `backticks` as code", () => {
    expect(parseInline("Im Terminal: `node run.mjs start`")).toEqual([
      { kind: "text", text: "Im Terminal: " },
      { kind: "code", text: "node run.mjs start" },
    ]);
  });

  it("leaves a single character emphasised", () => {
    expect(parseInline("*a*")).toEqual([{ kind: "em", text: "a" }]);
  });
});

describe("what must NOT become emphasis", () => {
  // Every case here is a way a naive parser eats text somebody meant literally.
  // The answer is shown to a customer, so a swallowed word is worse than a
  // visible asterisk.

  it("leaves an underscore alone — snake_case is not italic", () => {
    // The reason `_` is not a delimiter at all in this parser. An answer
    // naming `ai_usage_rows` would otherwise lose the middle of the word.
    expect(parseInline("die Tabelle ai_usage_rows")).toEqual([
      { kind: "text", text: "die Tabelle ai_usage_rows" },
    ]);
  });

  it("leaves a star with a space behind it alone — 2 * 3 is arithmetic", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ kind: "text", text: "2 * 3 * 4" }]);
  });

  it("leaves an unclosed marker literal — the half-streamed case", () => {
    // Mid-stream the closing stars have not arrived yet. Showing "**Mein"
    // for a moment is honest; swallowing it and popping it back is a flicker.
    expect(parseInline("Öffne **Mein")).toEqual([{ kind: "text", text: "Öffne **Mein" }]);
  });

  it("does not run emphasis across a line", () => {
    const block = parseAnswer("*eins\nzwei*")[0];
    if (block.kind !== "paragraph") throw new Error("expected a paragraph");
    expect(block.lines).toEqual([
      [{ kind: "text", text: "*eins" }],
      [{ kind: "text", text: "zwei*" }],
    ]);
  });
});

describe("blocks", () => {
  it("keeps a plain sentence as one paragraph", () => {
    expect(inlineOf("Guten Tag.")).toEqual([{ kind: "text", text: "Guten Tag." }]);
  });

  it("splits paragraphs on a blank line", () => {
    const blocks = parseAnswer("Eins.\n\nZwei.");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.kind === "paragraph")).toBe(true);
  });

  it("keeps a single newline as a line break inside one paragraph", () => {
    const block = parseAnswer("Eins.\nZwei.")[0];
    if (block.kind !== "paragraph") throw new Error("expected a paragraph");
    expect(block.lines).toHaveLength(2);
  });

  it("reads a dash list", () => {
    expect(parseAnswer("- Übersicht\n- Mein Konto")).toEqual([
      {
        kind: "list",
        ordered: false,
        start: 1,
        items: [
          [{ kind: "text", text: "Übersicht" }],
          [{ kind: "text", text: "Mein Konto" }],
        ],
      },
    ]);
  });

  it("reads a star list as a list, not as emphasis", () => {
    const block = parseAnswer("* Übersicht\n* Mein Konto")[0];
    expect(block.kind).toBe("list");
  });

  it("reads a numbered list and remembers where it starts", () => {
    const block = parseAnswer("3. Öffne Mein Konto\n4. Klicke auf Passwort")[0];
    if (block.kind !== "list") throw new Error("expected a list");
    expect(block.ordered).toBe(true);
    expect(block.start).toBe(3);
    expect(block.items).toHaveLength(2);
  });

  it("does not merge a numbered list into a bullet list", () => {
    const blocks = parseAnswer("- eins\n1. zwei");
    expect(blocks).toHaveLength(2);
  });

  it("ends a list at a blank line", () => {
    const blocks = parseAnswer("- eins\n\nDanach.");
    expect(blocks.map((block) => block.kind)).toEqual(["list", "paragraph"]);
  });

  it("starts a list straight after a paragraph without a blank line", () => {
    const blocks = parseAnswer("So geht es:\n1. Öffne Mein Konto");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "list"]);
  });

  it("renders a heading as a strong line rather than dropping the hashes", () => {
    // A model told to be brief should not emit one at all. If it does, the
    // hashes must not reach the customer.
    const block = parseAnswer("## Erste Schritte")[0];
    if (block.kind !== "paragraph") throw new Error("expected a paragraph");
    expect(block.lines[0]).toEqual([{ kind: "strong", text: "Erste Schritte" }]);
  });

  it("has nothing to say about an empty answer", () => {
    expect(parseAnswer("")).toEqual([]);
    expect(parseAnswer("\n\n  \n")).toEqual([]);
  });

  it("survives the whole answer that started this", () => {
    const blocks = parseAnswer(
      "Die ersten Schritte findest du im Menü links:\n\n" +
        "- **Übersicht**\n- **Mein Konto**\n\n" +
        "So setzt du ein Passwort:\n\n" +
        "1. Öffne *Mein Konto*\n2. Klicke auf `Passwort setzen`",
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "list",
      "paragraph",
      "list",
    ]);
  });
});
