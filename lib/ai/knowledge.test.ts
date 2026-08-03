// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import {
  KNOWLEDGE_MAX_CHARS,
  KNOWLEDGE_SECTIONS,
  VALIDATED_SECTIONS,
  allowedMediaMarkers,
  comparePaths,
  estimateTokens,
  parseDoc,
  parseFrontmatter,
  readKnowledgeFrom,
  type KnowledgeBase,
  type KnowledgeDoc,
} from "./knowledge";

const KNOWLEDGE = fileURLToPath(new URL("../../content/knowledge", import.meta.url));

function doc(frontmatter: string, body = "## A heading\n\nSome content."): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

describe("the section list", () => {
  // The type union lives in TypeScript and the validation lives in
  // `frontmatter.mjs`, because `node run.mjs kb-check` has to apply the same
  // rules without a bundler. Four strings written twice is a small price for
  // that — as long as something notices when they drift. This is that thing.
  //
  // Failing here? Add the section to BOTH `lib/ai/knowledge.ts` and
  // `lib/ai/frontmatter.mjs`, and mention it in the skill.
  it("is the same in the type and in the validator", () => {
    expect([...VALIDATED_SECTIONS]).toEqual([...KNOWLEDGE_SECTIONS]);
  });
});

describe("parseFrontmatter", () => {
  it("reads the key/value block and hands back the body", () => {
    const parsed = parseFrontmatter(doc("section: howto\ntitle: X"));
    expect(parsed?.data.get("section")).toBe("howto");
    expect(parsed?.data.get("title")).toBe("X");
    expect(parsed?.body).toBe("## A heading\n\nSome content.");
  });

  it("keeps a colon inside a quoted value", () => {
    // A summary reading "Note: this is optional" is the normal case, and an
    // unquoted one would silently lose everything after the first colon.
    const parsed = parseFrontmatter(doc(`summary: "Note: read this first"`));
    expect(parsed?.data.get("summary")).toBe("Note: read this first");
  });

  it("survives Windows line endings", () => {
    // Half the people writing these files are on Windows, and a parser that
    // only splits on \n leaves a stray \r on every value.
    const parsed = parseFrontmatter("---\r\nsection: howto\r\n---\r\n\r\nBody\r\n");
    expect(parsed?.data.get("section")).toBe("howto");
  });

  it("survives a byte-order mark in front of the fence", () => {
    const bom = String.fromCharCode(0xfeff);
    const parsed = parseFrontmatter(`${bom}${doc("section: howto")}`);
    expect(parsed?.data.get("section")).toBe("howto");
  });

  it("refuses a file with no fence, and one whose fence never closes", () => {
    expect(parseFrontmatter("# Just markdown\n")).toBeNull();
    expect(parseFrontmatter("---\nsection: howto\n\nno closing fence\n")).toBeNull();
  });
});

describe("parseDoc", () => {
  const valid = doc(
    [
      "section: reference",
      "title: The account page",
      "summary: What it shows.",
      "updated: 2026-07-24",
    ].join("\n"),
  );

  it("accepts a well-formed document", () => {
    const { doc: parsed, problems } = parseDoc("10-reference/a.md", valid);
    expect(problems).toEqual([]);
    expect(parsed).toMatchObject({
      path: "10-reference/a.md",
      section: "reference",
      title: "The account page",
      summary: "What it shows.",
      updated: "2026-07-24",
    });
  });

  it("treats a missing `updated` as absent rather than as an error", () => {
    // It is a maintenance signal for the operator, not something the answer
    // depends on — demanding it would only produce a date nobody keeps current.
    const { doc: parsed, problems } = parseDoc(
      "a.md",
      doc("section: howto\ntitle: T\nsummary: S"),
    );
    expect(problems).toEqual([]);
    expect(parsed?.updated).toBeNull();
  });

  it("names the problem when the section is missing or invented", () => {
    for (const frontmatter of [
      "title: T\nsummary: S",
      "section: faq\ntitle: T\nsummary: S",
    ]) {
      const { doc: parsed, problems } = parseDoc("a.md", doc(frontmatter));
      expect(parsed).toBeNull();
      expect(problems).toHaveLength(1);
      expect(problems[0].problem).toContain("section");
    }
  });

  it("insists on a title and a summary", () => {
    for (const frontmatter of [
      "section: howto\nsummary: S",
      "section: howto\ntitle: T",
      "section: howto\ntitle:   \nsummary: S",
    ]) {
      const { doc: parsed } = parseDoc("a.md", doc(frontmatter));
      expect(parsed, frontmatter).toBeNull();
    }
  });

  it("refuses an H1 in the body", () => {
    // The title comes from the frontmatter. A second one in the body renders
    // twice in the prompt and competes with it for the model's attention.
    const { doc: parsed, problems } = parseDoc(
      "a.md",
      doc("section: howto\ntitle: T\nsummary: S", "# Another title\n\nText."),
    );
    expect(parsed).toBeNull();
    expect(problems[0].problem).toContain("# ");
  });

  it("allows a '#' that is not a heading", () => {
    // "#1" and a hash inside a sentence are not H1s, and refusing them would
    // make the format feel arbitrary.
    const { doc: parsed } = parseDoc(
      "a.md",
      doc("section: howto\ntitle: T\nsummary: S", "Order #1234 is your order.\n\n## Step"),
    );
    expect(parsed).not.toBeNull();
  });

  it("refuses an empty body", () => {
    const { doc: parsed } = parseDoc("a.md", "---\nsection: howto\ntitle: T\nsummary: S\n---\n\n");
    expect(parsed).toBeNull();
  });
});

describe("comparePaths", () => {
  // THE guard on the prompt cache. The handbook is concatenated in this order,
  // and the cached prefix is matched byte for byte — two machines that order it
  // differently share no cache, with no error to notice.
  it("orders by code unit, not by the machine's locale", () => {
    const paths = ["b.md", "Z.md", "a.md", "Ä.md", "10.md", "2.md"];
    const once = [...paths].sort(comparePaths);
    const again = [...paths].reverse().sort(comparePaths);
    expect(once).toEqual(again);
    // Capital letters sort before lower-case ones — the code-unit answer, and
    // the one every machine agrees on. `localeCompare` would say otherwise.
    expect(once.indexOf("Z.md")).toBeLessThan(once.indexOf("a.md"));
  });

  it("is a total order", () => {
    expect(comparePaths("a", "a")).toBe(0);
    expect(comparePaths("a", "b")).toBeLessThan(0);
    expect(comparePaths("b", "a")).toBeGreaterThan(0);
  });
});

describe("estimateTokens", () => {
  it("is an estimate, and an honest one", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(3500)).toBe(1000);
  });
});

describe("the handbook this template ships", () => {
  const base = readKnowledgeFrom(KNOWLEDGE);

  // Failing here? `node run.mjs kb-check` prints the same list with the file
  // names, and `.claude/skills/ai-chat-knowledge/SKILL.md` describes the format.
  it("is free of format problems", () => {
    expect(base.problems).toEqual([]);
  });

  it("is not empty — an assistant with no handbook invents one", () => {
    expect(base.docs.length).toBeGreaterThan(0);
  });

  it("covers every section, so the starting point demonstrates the whole format", () => {
    const present = new Set(base.docs.map((d) => d.section));
    for (const section of KNOWLEDGE_SECTIONS) {
      expect([...present], `no document in section "${section}"`).toContain(section);
    }
  });

  it("stays inside the budget the full-context approach is cheap at", () => {
    expect(base.chars).toBeLessThanOrEqual(KNOWLEDGE_MAX_CHARS);
  });

  it("loads in the same order every time", () => {
    const again = readKnowledgeFrom(KNOWLEDGE);
    expect(again.docs.map((d) => d.path)).toEqual(base.docs.map((d) => d.path));
  });
});

describe("allowedMediaMarkers", () => {
  // The renderer's whitelist (AD-54): whole marker strings out of the loaded
  // docs' BODIES, and out of nothing else. Every case here goes through
  // `parseDoc` — the same validation `readKnowledgeFrom` applies — so "a doc
  // that failed validation contributes nothing" is tested the way it is true
  // in production: the doc never reaches `docs` in the first place.

  const MARKER = "[media:erste-schritte/rundgang.mp4|Der Rundgang]";

  function validated(path: string, body: string): KnowledgeDoc {
    const { doc: parsed, problems } = parseDoc(
      path,
      doc("section: howto\ntitle: T\nsummary: S", body),
    );
    expect(problems).toEqual([]);
    if (!parsed) throw new Error(`fixture doc ${path} failed validation`);
    return parsed;
  }

  function baseOf(docs: KnowledgeDoc[]): KnowledgeBase {
    return { docs, problems: [], chars: 0 };
  }

  it("collects the markers a handbook body carries, deduplicated", () => {
    const base = baseOf([
      validated("howto/a.md", `Los geht es.\n\n${MARKER}\n\nUnd nochmal: ${MARKER}`),
      validated("howto/b.md", `Anders: [media:preise/liste.pdf|Die Preisliste]`),
    ]);
    expect(allowedMediaMarkers(base)).toEqual([
      MARKER,
      "[media:preise/liste.pdf|Die Preisliste]",
    ]);
  });

  it("collects nothing from a handbook without markers", () => {
    const base = baseOf([validated("howto/a.md", "Nur Prosa, keine Marker.")]);
    expect(allowedMediaMarkers(base)).toEqual([]);
  });

  it("ignores a malformed marker — it is not a marker at all", () => {
    const base = baseOf([
      validated(
        "howto/a.md",
        "Kaputt: [media:Falsch/Datei.mp4|x] und [media:a/b.exe|x] und [media:a/b.mp4| x]",
      ),
    ]);
    expect(allowedMediaMarkers(base)).toEqual([]);
  });

  it("gets nothing from a doc that failed validation — it never reaches docs", () => {
    // The honest set: what the model never saw it cannot legitimately repeat.
    // A doc without a section is refused by `parseDoc`, so by construction it
    // cannot contribute — asserted here so the construction stays load-bearing.
    const { doc: refused } = parseDoc("howto/broken.md", doc("title: T\nsummary: S", MARKER));
    expect(refused).toBeNull();
  });

  it("does not read frontmatter — a media: entry is no render licence", () => {
    // Frontmatter `media:` lists are Story 18.4's cross-check. Only what the
    // model actually sees (the body) can license a card.
    const { doc: parsed, problems } = parseDoc(
      "howto/a.md",
      `---\nsection: howto\ntitle: T\nsummary: S\nmedia: ${MARKER}\n---\n\nNur Prosa.\n`,
    );
    expect(problems).toEqual([]);
    if (!parsed) throw new Error("fixture doc failed validation");
    expect(allowedMediaMarkers(baseOf([parsed]))).toEqual([]);
  });

  it("answers the deny-all default for an empty handbook", () => {
    expect(allowedMediaMarkers(baseOf([]))).toEqual([]);
  });
});

describe("a missing handbook", () => {
  it("is a problem, not a crash", () => {
    // The chat page has to be able to render a notice about this. A throw here
    // would turn a misconfiguration into an Internal Server Error.
    const base = readKnowledgeFrom(fileURLToPath(new URL("./does-not-exist", import.meta.url)));
    expect(base.docs).toEqual([]);
    expect(base.problems).toHaveLength(1);
  });
});
