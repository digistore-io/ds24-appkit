// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The assistant's handbook — the Markdown under `content/knowledge/`.
//
// This is the whole retrieval layer of the chat, and it is deliberately not a
// search engine. The complete handbook is sent to the model on every question,
// as a CACHED prompt prefix: identical bytes for every user of the installation,
// so the second and every later message reads it back at about a tenth of the
// input price. For a SaaS handbook — a few dozen pages — that is cheaper, more
// accurate and far less machinery than a vector database, which needs an
// embedding job, a chunking strategy, a migration and a second thing that can
// silently return the wrong paragraph. When it stops fitting, the seam to swap
// is `lib/ai/retriever.ts`, not this file. Reasoning and numbers:
// `docs/ai-chat.md`.
//
// ── Where the format lives ─────────────────────────────────────────────────
// In `frontmatter.mjs` next door, not here. `node run.mjs kb-check` has to
// apply exactly the same rules from plain Node, without a bundler and without
// TypeScript, and a format written down twice is a format that will disagree
// with itself. This file reads the filesystem and puts the types back on.
import { readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import {
  CHARS_PER_TOKEN,
  KNOWLEDGE_SECTIONS as SECTIONS,
  comparePaths as compare,
  estimateTokens as estimate,
  parseFrontmatter as parse,
  validateDoc,
} from "./frontmatter.mjs";
import {
  KNOWLEDGE_MAX_CHARS as MAX_CHARS,
  KNOWLEDGE_MIN_CHARS as MIN_CHARS,
  KNOWLEDGE_WARN_CHARS as WARN_CHARS,
  markdownFilesIn,
  renderedChars,
} from "./knowledge-files.mjs";

/** Where the handbook lives, relative to the project root. */
export const KNOWLEDGE_DIR = join("content", "knowledge");

/**
 * The four sections, and the order they are presented in.
 *
 * Written out again here purely so the union type exists — `frontmatter.mjs`
 * is plain JavaScript and can only hand back `string[]`, which would make
 * `KnowledgeSection` no narrower than `string` and lose every misspelling the
 * compiler currently catches. `frontmatter.mjs` remains the list the VALIDATION
 * uses; `lib/ai/knowledge.test.ts` fails the build if the two ever disagree.
 */
export const KNOWLEDGE_SECTIONS = [
  "onboarding",
  "reference",
  "howto",
  "glossary",
] as const;

/** The same list as the validator applies — compared in the test, not trusted. */
export const VALIDATED_SECTIONS: readonly string[] = SECTIONS;

export type KnowledgeSection = (typeof KNOWLEDGE_SECTIONS)[number];

export interface KnowledgeDoc {
  /** Path below `content/knowledge`, always with forward slashes. The sort key. */
  path: string;
  section: KnowledgeSection;
  title: string;
  /** One sentence — this is what the table of contents shows the model. */
  summary: string;
  /** ISO day, or null. Shown to nobody; a maintenance signal for the operator. */
  updated: string | null;
  /** The Markdown below the frontmatter. */
  body: string;
}

export interface KnowledgeProblem {
  /** The file, or `""` for a problem with the collection as a whole. */
  path: string;
  problem: string;
}

export interface KnowledgeBase {
  docs: KnowledgeDoc[];
  problems: KnowledgeProblem[];
  /** Characters across every body — the size that lands in the prompt. */
  chars: number;
}

export { CHARS_PER_TOKEN };

// The three size budgets live in `knowledge-files.mjs` next door, for the same
// reason the format lives in `frontmatter.mjs`: `node run.mjs kb-check` has to
// apply exactly the numbers the app applies, and it cannot import TypeScript.
// They were written down twice — `WARN_CHARS` as a bare literal in the script,
// and `KNOWLEDGE_MAX_CHARS` not at all, so the one command an operator runs
// before shipping never reported the one overrun this file flags.
export { MAX_CHARS as KNOWLEDGE_MAX_CHARS };
export { MIN_CHARS as KNOWLEDGE_MIN_CHARS };
export { WARN_CHARS as KNOWLEDGE_WARN_CHARS };

export function estimateTokens(chars: number): number {
  return estimate(chars);
}

export function isKnowledgeSection(value: unknown): value is KnowledgeSection {
  return (KNOWLEDGE_SECTIONS as readonly unknown[]).includes(value);
}

/** Order two document paths — deterministically, on any machine. */
export function comparePaths(a: string, b: string): number {
  return compare(a, b);
}

export interface Frontmatter {
  data: Map<string, string>;
  body: string;
}

/** The `key: value` block between the leading `---` fences. */
export function parseFrontmatter(raw: string): Frontmatter | null {
  return parse(raw) as Frontmatter | null;
}

export interface ParsedDoc {
  doc: KnowledgeDoc | null;
  problems: KnowledgeProblem[];
}

/** One file, checked against the format the skill writes. */
export function parseDoc(path: string, raw: string): ParsedDoc {
  return validateDoc(path, raw) as ParsedDoc;
}

/** Reads and validates the handbook. Pure enough to point at a fixture directory. */
export function readKnowledgeFrom(dir: string): KnowledgeBase {
  const docs: KnowledgeDoc[] = [];
  const problems: KnowledgeProblem[] = [];

  let exists = false;
  try {
    exists = statSync(dir).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) {
    return {
      docs,
      problems: [
        {
          path: "",
          problem: `${KNOWLEDGE_DIR} does not exist — the assistant has nothing to answer from`,
        },
      ],
      chars: 0,
    };
  }

  const scan = markdownFilesIn(dir);
  problems.push(...(scan.problems as KnowledgeProblem[]));

  for (const relative of scan.found as string[]) {
    const file = join(dir, relative.split("/").join(sep));

    // Guarded, because this read races with a person. The handbook is
    // deliberately re-read on every request outside production (see
    // `loadKnowledge` below) so the `ai-chat-knowledge` skill can rewrite it
    // while somebody is chatting to test her — which means a file can vanish
    // between the walk above and the read here. Everything below the delivery
    // layer answers with a code, and an exception escaping to
    // `app/api/chat/route.ts` is an HTML 500 sent to a `fetch()` that is
    // waiting for NDJSON.
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch (error) {
      problems.push({ path: relative, problem: `cannot be read: ${String(error)}` });
      continue;
    }

    const parsed = parseDoc(relative, raw);
    problems.push(...parsed.problems);
    if (parsed.doc) docs.push(parsed.doc);
  }

  docs.sort((a, b) => comparePaths(a.path, b.path));

  const chars = renderedChars(docs) as number;
  if (docs.length === 0 && problems.length === 0) {
    problems.push({ path: "", problem: `${KNOWLEDGE_DIR} holds no .md files` });
  }
  if (chars > MAX_CHARS) {
    problems.push({
      path: "",
      problem: `the handbook is ${chars} characters (about ${estimateTokens(chars)} tokens) and the budget is ${MAX_CHARS} — see docs/ai-chat.md on swapping the retriever`,
    });
  }

  return { docs, problems, chars };
}

let cached: KnowledgeBase | null = null;

/**
 * The handbook of this installation.
 *
 * Memoized in production, re-read otherwise: the files change while somebody is
 * writing them, and a restart between every paragraph would make the skill's
 * "ask her three real questions" step unusable.
 */
export function loadKnowledge(): KnowledgeBase {
  if (process.env.NODE_ENV === "production" && cached) return cached;
  const base = readKnowledgeFrom(join(process.cwd(), KNOWLEDGE_DIR));

  // ⚠️ Only a handbook is remembered, never the absence of one. A read that
  // found nothing is not an answer — it is a machine that was not ready yet: a
  // volume mounted late, a filesystem still settling after a deploy. Caching
  // that turned a startup race into a permanent outage, because nothing
  // re-reads and nothing invalidates: she answered `chatNoKnowledge` until
  // somebody restarted the process, hours after the files were fine.
  if (base.docs.length > 0) cached = base;
  return base;
}

/** Test seam — drops the memoized handbook. */
export function resetKnowledgeCache(): void {
  cached = null;
}
