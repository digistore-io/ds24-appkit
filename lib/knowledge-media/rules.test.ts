// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The grammar is security surface: the path validator is the media route's
// second guard (AD-53), so the refusal classes below — traversal, dot
// segments, empty segments, depth, casing, character set, extension-dot count
// — are not pedantry. The grammar excludes every traversal shape BY
// CONSTRUCTION; these tests exist to prove it stays that way.
//
// Two agreements are pinned as well, because AD-56's whole point is that
// nothing can disagree about what a valid reference is: the procedural
// validator against the exported path pattern, and `markersIn` against the
// exported marker pattern (the one `lib/ai/markdown.ts` composes from in
// Story 18.3).
import { describe, expect, it } from "vitest";

import {
  isValidMediaPath,
  KNOWLEDGE_MEDIA_BUCKET_PREFIX,
  KNOWLEDGE_MEDIA_SHIPPED_MAX_BYTES,
  KNOWLEDGE_MEDIA_TTL_SECONDS,
  KNOWLEDGE_MEDIA_TYPES,
  markersIn,
  MEDIA_MARKER_PATTERN,
  MEDIA_PATH_PATTERN,
} from "./rules.mjs";

const ACCEPTED_PATHS = [
  "topic/file.mp4",
  "a-topic/intro-video.webm",
  "a1/2b.pdf",
  "einfuehrung/lektion-01.mp3",
];

const REFUSED_PATHS: [what: string, path: string][] = [
  // ── traversal shapes ──────────────────────────────────────────────────────
  ["a parent-directory hop", "../secret.mp4"],
  ["a hop hidden mid-path", "topic/../other.mp4"],
  ["a current-directory prefix", "./topic/file.mp4"],
  ["a leading slash (empty first segment)", "/topic/file.mp4"],
  ["an empty segment in the middle", "topic//file.mp4"],
  ["a trailing slash (empty last segment)", "topic/file.mp4/"],
  ["a backslash — a refused character, never a separator", "topic\\file.mp4"],
  ["the empty string", ""],
  ["a bare dot", "."],
  ["a bare double dot", ".."],
  // ── depth: exactly two segments (decided 2026-08-03, see rules.mjs) ──────
  ["depth 1 — a file with no topic coordinate", "file.mp4"],
  ["depth 3", "a/b/c.mp4"],
  // ── casing and character set ──────────────────────────────────────────────
  ["an uppercase topic", "Topic/file.mp4"],
  ["an uppercase file", "topic/File.mp4"],
  ["an uppercase extension", "topic/file.MP4"],
  ["an umlaut in the topic", "töpic/file.mp4"],
  ["an umlaut in the file", "topic/übung.mp4"],
  ["a space in the topic", "my topic/file.mp4"],
  ["a space in the file", "topic/my file.mp4"],
  ["an underscore", "topic_a/file.mp4"],
  ["a percent escape (judged decoded, refused encoded)", "topic/file%2e.mp4"],
  ["a leading hyphen", "-topic/file.mp4"],
  ["a trailing hyphen", "topic-/file.mp4"],
  ["a double hyphen", "topic--a/file.mp4"],
  // ── the extension dot ─────────────────────────────────────────────────────
  ["no extension dot at all", "topic/file"],
  ["two dots in the file", "topic/a.b.mp4"],
  ["a dot in a non-final segment", "to.pic/a.mp4"],
  ["an empty stem before the dot", "topic/.mp4"],
  ["an empty extension after the dot", "topic/file."],
  // ── the allow-map is the authority ────────────────────────────────────────
  ["an unknown extension", "topic/file.exe"],
  ["an SVG — a document that can carry script", "topic/file.svg"],
];

describe("the path grammar", () => {
  for (const path of ACCEPTED_PATHS) {
    it(`accepts ${path}`, () => {
      expect(isValidMediaPath(path)).toBe(true);
    });
  }

  for (const [what, path] of REFUSED_PATHS) {
    it(`refuses ${what}: ${JSON.stringify(path)}`, () => {
      expect(isValidMediaPath(path)).toBe(false);
    });
  }

  it("accepts every allow-map extension and nothing needs a special case", () => {
    for (const extension of Object.keys(KNOWLEDGE_MEDIA_TYPES)) {
      expect(isValidMediaPath(`topic/file.${extension}`)).toBe(true);
    }
  });

  it("refuses non-strings without throwing", () => {
    // The route hands this whatever the URL parser produced; a crash here
    // would turn a malformed request into a 500 instead of a refusal.
    expect(isValidMediaPath(undefined as unknown as string)).toBe(false);
    expect(isValidMediaPath(null as unknown as string)).toBe(false);
    expect(isValidMediaPath(42 as unknown as string)).toBe(false);
  });

  it("agrees with the exported path pattern on every case above", () => {
    // AD-56: the pattern (what the marker grammar embeds) and the validator
    // (what the route calls) are two projections of ONE grammar. If this
    // fails, the module has grown the exact two-arithmetics failure it exists
    // to prevent.
    const anchored = new RegExp(`^(?:${MEDIA_PATH_PATTERN})$`);
    for (const path of [...ACCEPTED_PATHS, ...REFUSED_PATHS.map(([, p]) => p)]) {
      expect(anchored.test(path), `pattern vs validator on ${JSON.stringify(path)}`).toBe(
        isValidMediaPath(path),
      );
    }
  });
});

const ACCEPTED_MARKERS = [
  "[media:topic/file.mp4|Watch this]",
  "[media:a-topic/intro-video.webm|Die Einführung ansehen]",
  "[media:einfuehrung/lektion-01.mp3|Lektion 1 — Audio (12 min)]",
];

const REFUSED_MARKERS: [what: string, marker: string][] = [
  ["an empty label", "[media:topic/file.mp4|]"],
  ["a whitespace-only label", "[media:topic/file.mp4| ]"],
  ["a pipe in the label", "[media:topic/file.mp4|a|b]"],
  ["a newline in the label", "[media:topic/file.mp4|line\nbreak]"],
  ["padding before the pipe", "[media:topic/file.mp4 |label]"],
  ["padding after the pipe", "[media:topic/file.mp4| label]"],
  ["padding before the closing bracket", "[media:topic/file.mp4|label ]"],
  ["a missing label part", "[media:topic/file.mp4]"],
  ["a missing closing bracket", "[media:topic/file.mp4|label"],
  // A well-formed frame around a path the path grammar refuses is not a
  // marker — the pattern embeds the full path grammar, allow-map included.
  ["a traversal path inside the frame", "[media:../secret.mp4|label]"],
  ["an uppercase path inside the frame", "[media:Topic/file.mp4|label]"],
  ["a depth-1 path inside the frame", "[media:file.mp4|label]"],
  ["an unknown extension inside the frame", "[media:topic/file.exe|label]"],
];

describe("the marker grammar", () => {
  for (const marker of ACCEPTED_MARKERS) {
    it(`accepts ${marker}`, () => {
      expect(markersIn(marker)).toEqual([marker]);
    });
  }

  for (const [what, marker] of REFUSED_MARKERS) {
    it(`refuses ${what}: ${JSON.stringify(marker)}`, () => {
      expect(markersIn(marker)).toEqual([]);
    });
  }

  it("a ] ends the label — the rest is ordinary text", () => {
    // Not a refusal but a boundary: the label cannot CONTAIN a ], so the
    // marker ends at the first one and the tail stays prose.
    expect(markersIn("[media:topic/file.mp4|la]bel]")).toEqual([
      "[media:topic/file.mp4|la]",
    ]);
  });

  it("is exported as a composable source, not a RegExp", () => {
    // Story 18.3 embeds this string into the markdown parser's inline
    // alternative. A RegExp object cannot be composed into a larger pattern;
    // a source string can.
    expect(typeof MEDIA_MARKER_PATTERN).toBe("string");
    expect(() => new RegExp(MEDIA_MARKER_PATTERN, "g")).not.toThrow();
  });

  it("captures path and label for whoever composes from it", () => {
    const match = new RegExp(MEDIA_MARKER_PATTERN).exec(
      "[media:topic/file.mp4|Watch this]",
    );
    expect(match?.[1]).toBe("topic/file.mp4");
    expect(match?.[2]).toBe("Watch this");
  });

  it("agrees with markersIn on every case above", () => {
    // Same contract as the path half: extractor and pattern are one grammar.
    const anchored = new RegExp(`^(?:${MEDIA_MARKER_PATTERN})$`);
    for (const marker of [
      ...ACCEPTED_MARKERS,
      ...REFUSED_MARKERS.map(([, m]) => m),
    ]) {
      const wholeStringExtracted = markersIn(marker).includes(marker);
      expect(
        anchored.test(marker),
        `pattern vs markersIn on ${JSON.stringify(marker)}`,
      ).toBe(wholeStringExtracted);
    }
  });
});

describe("markersIn over a text", () => {
  it("extracts every well-formed marker, whole and in order, skipping the malformed", () => {
    const text = [
      "Watch [media:topic/intro.mp4|the introduction] first.",
      "This one is broken: [media:topic/../evil.mp4|nope].",
      "Then read [media:topic/handout.pdf|the handout] before the call.",
      "And [media:UPPER/case.mp4|not this one] stays prose.",
    ].join("\n");

    // Whole marker strings on purpose: AD-54's allowed-set is exactly this
    // output, and the parser asks about the complete string.
    expect(markersIn(text)).toEqual([
      "[media:topic/intro.mp4|the introduction]",
      "[media:topic/handout.pdf|the handout]",
    ]);
  });

  it("answers [] for empty and non-string input", () => {
    expect(markersIn("")).toEqual([]);
    expect(markersIn("no markers here")).toEqual([]);
    expect(markersIn(undefined as unknown as string)).toEqual([]);
  });
});

describe("markersIn ignores code, exactly as the parser does", () => {
  // `lib/ai/markdown.ts` puts the code span BEFORE the marker in its inline
  // alternation on purpose, so a quoted marker renders as code. If the
  // extractor read it as a marker anyway, a handbook page explaining the
  // syntax would feed its own example into the AD-54 whitelist — and kb-check
  // would then demand a real file behind a line of documentation.

  it("does not extract a marker quoted in an inline code span", () => {
    expect(markersIn("Write it as `[media:topic/intro.mp4|the intro]`.")).toEqual([]);
  });

  it("does not extract a marker inside a fenced block", () => {
    const page = [
      "Markers look like this:",
      "",
      "```",
      "[media:topic/intro.mp4|the intro]",
      "```",
      "",
      "That is all.",
    ].join("\n");
    expect(markersIn(page)).toEqual([]);
  });

  it("still extracts a real marker on a page that also quotes one", () => {
    // The case that matters: documentation and use on the same page. The
    // quoted one is prose about the syntax, the loose one is an actual offer.
    const page = [
      "The syntax is `[media:topic/example.mp4|Beispiel]` — path, pipe, label.",
      "",
      "```",
      "[media:topic/fenced.mp4|Im Block]",
      "```",
      "",
      "Watch [media:topic/intro.mp4|the introduction] to see it in action.",
    ].join("\n");
    expect(markersIn(page)).toEqual(["[media:topic/intro.mp4|the introduction]"]);
  });

  it("does not glue a marker together out of the pieces around a code span", () => {
    // Code is blanked to a NEWLINE, never to the empty string: `` `y` ``
    // removed from `[media:a/b.mp4|x`y`]` would leave a marker nobody wrote,
    // and a line break is the one replacement the grammar can never span.
    expect(markersIn("[media:topic/intro.mp4|x`y`]")).toEqual([]);
  });

  it("leaves an unclosed fence alone rather than swallowing the rest", () => {
    // Without a closing run there is no way to say where the code stopped;
    // guessing "to the end" would drop every real marker after a stray
    // backtick, and dropping a real offer is the worse direction.
    const page = ["```", "oops, never closed", "", "[media:topic/intro.mp4|the intro]"].join(
      "\n",
    );
    expect(markersIn(page)).toEqual(["[media:topic/intro.mp4|the intro]"]);
  });
});

describe("the allow-map and the constants", () => {
  it("maps the ten extensions to their content type and kind", () => {
    expect(KNOWLEDGE_MEDIA_TYPES).toEqual({
      mp4: { contentType: "video/mp4", kind: "video" },
      webm: { contentType: "video/webm", kind: "video" },
      mp3: { contentType: "audio/mpeg", kind: "audio" },
      ogg: { contentType: "audio/ogg", kind: "audio" },
      wav: { contentType: "audio/wav", kind: "audio" },
      jpg: { contentType: "image/jpeg", kind: "image" },
      jpeg: { contentType: "image/jpeg", kind: "image" },
      png: { contentType: "image/png", kind: "image" },
      webp: { contentType: "image/webp", kind: "image" },
      pdf: { contentType: "application/pdf", kind: "document" },
    });
  });

  it("uses only the four kinds the renderer knows", () => {
    const kinds = new Set(
      Object.values(KNOWLEDGE_MEDIA_TYPES).map((entry) => entry.kind),
    );
    expect([...kinds].sort()).toEqual(["audio", "document", "image", "video"]);
  });

  it("pins the bucket prefix and the two tunables", () => {
    // Named constants by decision, not config (Epic 18 intro) — a change here
    // is a product decision, and this test makes it a visible one.
    expect(KNOWLEDGE_MEDIA_BUCKET_PREFIX).toBe("knowledge/");
    expect(KNOWLEDGE_MEDIA_TTL_SECONDS).toBe(21600);
    expect(KNOWLEDGE_MEDIA_SHIPPED_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
