// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The code blocks in `docs/visuals.md` are meant to be copied, so they have to
// work when they are.
//
// ── Why this test exists ───────────────────────────────────────────────────
// It was written after shipping a recipe that used `Button` and `t()` without
// importing either. It had been checked — but against a reconstruction with the
// imports added, not against the text on the page. Somebody copying it would
// have got two compile errors in the one recipe that carries a legal
// consequence, and their first impression of this documentation would have been
// that it does not run.
//
// ── What it checks, and what it deliberately does not ──────────────────────
// It parses each block with TypeScript's own parser (so a syntax error fails
// here rather than in somebody's editor) and then asserts the thing that
// actually went wrong: **every component used is either imported or defined in
// the same block.** A missing import is invisible to a reader — the code looks
// complete — which is exactly the class of mistake a test should hold.
//
// It is NOT a type check. Doing that properly means building a Program against
// the app's `tsconfig`, which is seconds per run for a handful of examples. The
// gap is stated rather than hidden: a recipe can still be wrong about a prop's
// type, and the way to find that is to paste it into the app once.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Guidance whose code blocks are offered for copying. */
const FILES = ["docs/visuals.md"];

/** ```tsx fenced blocks, in file order. */
function tsxBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```tsx\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** A block that stands on its own — a component, rather than a usage fragment. */
function isSelfContained(block: string): boolean {
  return /export function |^"use client"/m.test(block);
}

/** Every `<Capitalised …>` used in the block. */
function componentsUsed(block: string): string[] {
  return [...new Set([...block.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
}

/** Every name the block brings in or declares itself. */
function namesAvailable(block: string): Set<string> {
  const names = new Set<string>();

  for (const match of block.matchAll(/import\s+([^;]+?)\s+from\s+["'][^"']+["']/g)) {
    for (const part of match[1].replace(/[{}]/g, " ").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of block.matchAll(/(?:export\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]);
  }
  for (const match of block.matchAll(/(?:const|let)\s+([A-Za-z0-9_]+)\s*=/g)) {
    names.add(match[1]);
  }
  return names;
}

describe("the recipes in the guidance", () => {
  for (const file of FILES) {
    const blocks = tsxBlocks(readFileSync(join(ROOT, file), "utf8"));
    const recipes = blocks.filter(isSelfContained);

    it(`${file} still has recipes to check`, () => {
      // A guard against the extraction silently finding nothing, which would
      // make every assertion below pass for the wrong reason.
      expect(recipes.length).toBeGreaterThan(0);
    });

    recipes.forEach((block, index) => {
      const name =
        /export function ([A-Za-z0-9_]+)/.exec(block)?.[1] ?? `block ${index + 1}`;

      it(`${file} → ${name} parses`, () => {
        const source = ts.createSourceFile(
          "recipe.tsx",
          block,
          ts.ScriptTarget.ESNext,
          true,
          ts.ScriptKind.TSX,
        );
        // `parseDiagnostics` is not on the public type but is what the parser
        // fills in; a syntax error here is a recipe nobody can paste.
        const errors = (source as unknown as { parseDiagnostics?: unknown[] })
          .parseDiagnostics;
        expect(errors ?? [], `${name} does not parse`).toHaveLength(0);
      });

      it(`${file} → ${name} imports every component it uses`, () => {
        const available = namesAvailable(block);
        const missing = componentsUsed(block).filter((used) => !available.has(used));
        expect(
          missing,
          `${name} uses ${missing.join(", ")} without importing or defining it — ` +
            `a reader copying this block gets a compile error`,
        ).toEqual([]);
      });
    });
  }
});
