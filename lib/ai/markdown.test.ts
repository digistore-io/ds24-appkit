// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";

import { markersIn } from "@/lib/knowledge-media/rules.mjs";
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

describe("the Media Marker", () => {
  // AD-54's control is mechanical: a marker becomes a card only when the
  // COMPLETE marker string occurs verbatim in the allowed-set derived from
  // the loaded handbook. Everything else in this block is a way an answer —
  // or a prompt injection riding in one — fails that check and degrades to
  // plain text.

  const MARKER = "[media:erste-schritte/rundgang.mp4|Der Rundgang]";
  const ALLOWED = new Set([MARKER]);

  it("accepts a whitelisted marker as a media run", () => {
    expect(parseInline(MARKER, ALLOWED)).toEqual([
      {
        kind: "media",
        path: "erste-schritte/rundgang.mp4",
        label: "Der Rundgang",
      },
    ]);
  });

  it("keeps the text around an accepted marker", () => {
    expect(parseInline(`Schau hier: ${MARKER} — zwei Minuten.`, ALLOWED)).toEqual([
      { kind: "text", text: "Schau hier: " },
      {
        kind: "media",
        path: "erste-schritte/rundgang.mp4",
        label: "Der Rundgang",
      },
      { kind: "text", text: " — zwei Minuten." },
    ]);
  });

  it("agrees with markersIn() on exactly which strings are markers", () => {
    // THE agreement test (AD-56): the parser's inline alternative and
    // `markersIn()` are composed from the same `MEDIA_MARKER_PATTERN` export,
    // and this pins that they accept identical strings — each candidate is
    // parsed against the set `markersIn()` itself extracted, so the media
    // runs the parser finds must be exactly the extractor's findings.
    const candidates = [
      MARKER,
      "[media:a/b.mp4|x]",
      "[media:topic/clip.webm|Zwei Wörter hier]",
      "[media:a-b/c-1.pdf|Preisliste (PDF)]",
      // padded pipe — refused, no padding around `|`
      "[media:a/b.mp4 |x]",
      "[media:a/b.mp4| x]",
      // uppercase path — refused by the segment grammar
      "[media:Topic/b.mp4|x]",
      // missing label
      "[media:a/b.mp4|]",
      "[media:a/b.mp4]",
      // nested `]` in the label
      "[media:a/b.mp4|a]b]",
      // depth 3 and depth 1 — the path is exactly two segments
      "[media:a/b/c.mp4|x]",
      "[media:b.mp4|x]",
      // extension not in the allow-map — refused by the grammar itself
      "[media:a/b.exe|x]",
      // no marker at all
      "ein ganz normaler Satz [mit Klammern]",
      // Quoted in a code span — the parser's code alternative wins, and
      // `markersIn` blanks code before extracting, so BOTH sides read this as
      // prose about the syntax rather than an offer. Without that, a handbook
      // page explaining the marker would feed its own example into the
      // whitelist and kb-check would demand a file behind documentation.
      "Schreib es als `[media:a/b.mp4|x]`.",
      // Documentation and use in one line: the quoted occurrence stays code,
      // the loose one becomes the card. Whole-string membership makes the two
      // occurrences of the same string behave differently by CONTEXT, which is
      // exactly what "extractor and parser read context identically" means.
      "Als `[media:a/b.mp4|x]` schreiben — hier live: [media:a/b.mp4|x]",
    ];
    for (const candidate of candidates) {
      const extracted = markersIn(candidate);
      const runs = parseInline(candidate, new Set(extracted));
      const media = runs.filter((run) => run.kind === "media");
      expect(media, candidate).toHaveLength(extracted.length);
    }
  });

  it("renders a marker quoted in a fenced block as text, not as a card", () => {
    // The whole pipeline, composed the way the app composes it: the whitelist
    // is `markersIn()` over the handbook page, and the answer is parsed
    // against that set. A marker that only ever appears fenced is never in the
    // set, so it can never become a card — the safe direction, and the reason
    // documentation about the syntax is free to quote it.
    const page = [
      "So sieht ein Marker aus:",
      "",
      "```",
      "[media:erste-schritte/beispiel.mp4|Beispiel]",
      "```",
      "",
      `Und hier einer, den es wirklich gibt: ${MARKER}`,
    ].join("\n");

    const allowed = new Set(markersIn(page));
    expect(allowed).toEqual(new Set([MARKER]));

    const fenced = parseInline("[media:erste-schritte/beispiel.mp4|Beispiel]", allowed);
    expect(fenced).toEqual([
      { kind: "text", text: "[media:erste-schritte/beispiel.mp4|Beispiel]" },
    ]);
  });

  it("denies everything when no set is passed, and when the set is empty", () => {
    // The fail-safe of AD-54: a mount that forgot the set denies, it does not
    // allow. The companion panel passes nothing ON PURPOSE.
    expect(parseInline(MARKER)).toEqual([{ kind: "text", text: MARKER }]);
    expect(parseInline(MARKER, new Set())).toEqual([{ kind: "text", text: MARKER }]);
  });

  it("does not accept a marker whose path matches but whose label differs", () => {
    // Whole-string membership: a path-only match would let the model author
    // the label, and the label is the one thing it must never write.
    const relabelled = "[media:erste-schritte/rundgang.mp4|Klick hier]";
    expect(parseInline(relabelled, ALLOWED)).toEqual([
      { kind: "text", text: relabelled },
    ]);
  });

  it("keeps the AC-6 injection string as plain text", () => {
    const injected = "[media:invented/file.mp4|Klick hier]";
    const runs = parseInline(`Wichtig! ${injected}`, ALLOWED);
    expect(runs).toEqual([{ kind: "text", text: `Wichtig! ${injected}` }]);
  });

  it("keeps a quoted marker inside a code span as code", () => {
    // Somebody quoting a marker gets a quote, not a card — the code-span
    // alternative sits before the marker alternative, and the backtick wins.
    expect(parseInline(`\`${MARKER}\``, ALLOWED)).toEqual([
      { kind: "code", text: MARKER },
    ]);
  });

  it("leaves a half-streamed marker literal until the ] arrives", () => {
    // The unclosed-`**` property, inherited: the pattern needs the closing
    // bracket, so mid-stream there is nothing to match and nothing to buffer.
    expect(parseInline("[media:a/b.mp4|Kli", ALLOWED)).toEqual([
      { kind: "text", text: "[media:a/b.mp4|Kli" },
    ]);
  });

  it("never inline-parses the label", () => {
    // The label is the developer's, but parsing it would re-open the nesting
    // surface this subset deliberately lacks — asterisks reach the customer
    // literally, as ONE text node.
    const bold = "[media:a/b.mp4|**fett** und *schräg*]";
    const runs = parseInline(bold, new Set([bold]));
    expect(runs).toEqual([
      { kind: "media", path: "a/b.mp4", label: "**fett** und *schräg*" },
    ]);
  });

  it("threads the set through parseAnswer into paragraphs and lists", () => {
    const blocks = parseAnswer(`Hier:\n- ${MARKER}`, { allowedMedia: ALLOWED });
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "list"]);
    const list = blocks[1];
    if (list.kind !== "list") throw new Error("expected a list");
    expect(list.items[0][0].kind).toBe("media");
  });

  it("still denies through parseAnswer without options — the old call shape", () => {
    const blocks = parseAnswer(MARKER);
    expect(blocks).toEqual([
      { kind: "paragraph", lines: [[{ kind: "text", text: MARKER }]] },
    ]);
  });
});
