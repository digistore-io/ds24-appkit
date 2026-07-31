// Copyright (c) 2026 Digistore24 Inc, SPDX-License-Identifier: MIT

// The dependency decisions that cannot be written down where they are made.
//
// `package.json` and `package-lock.json` are JSON: they hold no comments. So an
// `overrides` entry looks like an arbitrary version to whoever reads it next,
// and the two most likely things to happen to it are that somebody deletes it as
// noise or narrows it back into the shape that caused the noise. This file is
// where the reasoning lives instead — the same arrangement `scripts/dev/fixes.json`
// has, and for the same reason.
//
// Three decisions are pinned here.
//
// ── 1. The esbuild override is a FLOOR, not a pin ───────────────────────────
// It exists because GHSA-67mh-4wv8-2f99 let esbuild's development server answer
// cross-origin requests, fixed in 0.25.0. Removing it is not an option:
// drizzle-kit reaches esbuild through @esbuild-kit/core-utils, whose own range
// goes back into 0.18.
//
// It was written `^0.25.12`, which is `>=0.25.12 <0.26.0` — a pin. vite 8 (via
// vitest) and tsx 4 both ask for `^0.28`, so every `npm install` printed a wall
// of `npm WARN ERESOLVE overriding peer dependency` at somebody who had just
// deployed the app, and npm lost the argument anyway: `npm ls esbuild` reported
// two `invalid` entries. A floor says what was always meant and prints nothing.
//
// ── 2. brace-expansion must carry the expansion cap ────────────────────────
// GHSA-mh99-v99m-4gvg: a brace bomb expands without bound and takes the process
// down with an out-of-memory crash. It reaches this project only through eslint,
// so it never ships — but a lockfile is what a fresh clone installs, and there
// is no reason to hand anybody the version that dies. Measured, not assumed:
//
//     1.1.16 -> heap out of memory      (what this lockfile used to pin)
//     1.1.18 -> returns a capped list
//
// The floors are per major because the fix was backported: 1.1.18 and 5.0.8.
// An unvetted major fails this test rather than passing quietly — the check is
// "somebody measured this one", and nobody has measured 3.x or 4.x here.
//
// ── 3. minimatch and brace-expansion may NEVER be overridden ───────────────
// This is the load-bearing one, because it forbids the fix that looks best.
//
// `npm audit` reports nine high findings on this tree. All nine are in
// devDependencies — `npm audit --omit=dev` is `found 0 vulnerabilities`, which is
// what the skill `security-gateway` §5 already runs — and they persist because
// the advisory range is written `<=5.0.7` across all majors, so the 1.x backport
// that fixes the bug sits inside it.
//
// `"overrides": { "minimatch": "^10" }` makes that count zero. It also breaks
// the linter. minimatch@10's CommonJS build exports an OBJECT and sets
// `__esModule: true` with no `default`; eslint-plugin-import,
// eslint-plugin-jsx-a11y and eslint-plugin-react all do
// `_interopRequireDefault(require('minimatch'))` and end up calling `undefined`:
//
//     TypeError: minimatch is not a function
//     Rule: "react/forbid-component-props"
//
// `npm run lint` in this project stays GREEN, because eslint-config-next enables
// none of the affected rules. That is exactly what makes it dangerous: it ships
// as a landmine for the first customer who switches one on. The same reasoning
// rules out overriding brace-expansion to `^5` — 5.x's CJS export is
// `{ EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand }`, where minimatch@3 calls the
// module itself.
//
// A clean `npm audit` is not worth a crash in somebody else's app. If the two
// packages ever have to be forced, the way through is upstream —
// eslint-config-next moving its plugins off minimatch@3 — not an override here.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const json = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const pkg = json("package.json");
const lock = json("package-lock.json");

/** The esbuild dev-server CVE was fixed in 0.25.0; 0.25.12 is where we came in. */
const ESBUILD_FLOOR = "0.25.12";

/** Majors of brace-expansion somebody has measured, and the version that caps. */
const BRACE_EXPANSION_FLOORS: Record<string, string> = { "1": "1.1.18", "5": "5.0.8" };

/** Packages that must never appear in `overrides` — see decision 3 above. */
const NEVER_OVERRIDE = ["minimatch", "brace-expansion"];

/** `1.2.3` → `[1, 2, 3]`. Every version here is a plain triple. */
function triple(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`not a plain version: ${version}`);
  }
  return [parts[0], parts[1], parts[2]];
}

/**
 * The version a `">=x.y.z"` range admits from below, or null for anything else.
 *
 * Deliberately strict rather than forgiving: a range this cannot read is a range
 * whose lower bound nobody can state, and reporting that is the whole job here.
 */
function floorOf(range: string): string | null {
  return /^>=\s*(\d+\.\d+\.\d+)$/.exec(range.trim())?.[1] ?? null;
}

/** True when `version` is at or above `floor`. */
function atLeast(version: string, floor: string): boolean {
  const [a, b, c] = triple(version);
  const [x, y, z] = triple(floor);
  return a !== x ? a > x : b !== y ? b > y : c >= z;
}

/** Every resolved copy of one package in the lockfile, with the path it sits at. */
function resolved(name: string): { where: string; version: string }[] {
  return Object.entries(lock.packages as Record<string, { version?: string }>)
    .filter(([where]) => where.split("node_modules/").pop() === name)
    .map(([where, entry]) => ({ where, version: entry.version ?? "" }))
    .filter((entry) => entry.version !== "");
}

describe("the esbuild override", () => {
  it("is still there — drizzle-kit's chain reaches back into 0.18 without it", () => {
    expect(pkg.overrides?.esbuild).toBeTruthy();
  });

  it("is a floor, not a pin — a caret range is what printed ERESOLVE at every install", () => {
    const range: string = pkg.overrides.esbuild;
    const floor = floorOf(range);
    expect(
      floor,
      `overrides.esbuild is "${range}". It has to be a floor (">=x.y.z"): vite and tsx ` +
        `ask for ^0.28, and a caret or exact range makes npm print ERESOLVE on every ` +
        `install and leaves the tree invalid. See the header of this file.`,
    ).not.toBeNull();
    expect(
      atLeast(floor as string, ESBUILD_FLOOR),
      `the floor is ${floor}, below ${ESBUILD_FLOOR} — the dev-server CVE ` +
        `(GHSA-67mh-4wv8-2f99) is what the override is for.`,
    ).toBe(true);
  });

  it("permits every copy the lockfile actually resolved", () => {
    // No fallback when the range is not a floor: a copy outside the declared
    // override is what npm calls `invalid`, and checking it against a guessed
    // floor instead would report a healthy tree while npm reports a broken one.
    const floor = floorOf(pkg.overrides.esbuild);
    expect(
      floor,
      `overrides.esbuild is "${pkg.overrides.esbuild}", so what it admits cannot be ` +
        `checked against the lockfile here. Make it a floor (">=x.y.z").`,
    ).not.toBeNull();
    const copies = resolved("esbuild");
    expect(copies.length).toBeGreaterThan(0);
    for (const { where, version } of copies) {
      expect(
        atLeast(version, floor as string),
        `${where} resolved esbuild@${version}, below the override's floor ${floor}. ` +
          `npm would report this as "invalid" — regenerate package-lock.json.`,
      ).toBe(true);
    }
  });
});

describe("brace-expansion", () => {
  it("carries the expansion cap in every copy the lockfile resolved", () => {
    const copies = resolved("brace-expansion");
    expect(copies.length).toBeGreaterThan(0);
    for (const { where, version } of copies) {
      const major = String(triple(version)[0]);
      const floor = BRACE_EXPANSION_FLOORS[major];
      expect(
        floor,
        `${where} resolved brace-expansion@${version}, and nobody has measured ` +
          `whether ${major}.x caps its expansion. Check it against a brace bomb and ` +
          `add the floor to BRACE_EXPANSION_FLOORS.`,
      ).toBeTruthy();
      expect(
        atLeast(version, floor),
        `${where} resolved brace-expansion@${version}, below ${floor} — that version ` +
          `dies of an out-of-memory crash on a brace bomb (GHSA-mh99-v99m-4gvg). ` +
          `Regenerate package-lock.json.`,
      ).toBe(true);
    }
  });
});

describe("the audit findings that stay", () => {
  it("is not silenced with an override that breaks the linter", () => {
    for (const name of NEVER_OVERRIDE) {
      expect(
        pkg.overrides?.[name],
        `overrides.${name} is set. It makes "npm audit" read clean and makes ` +
          `eslint-plugin-react/import/jsx-a11y throw "minimatch is not a function" ` +
          `on any rule that matches a pattern — while this project's own lint stays ` +
          `green, so it ships as a landmine. The nine findings are dev-only; ` +
          `"npm audit --omit=dev" is clean. See the header of this file.`,
      ).toBeUndefined();
    }
  });
});
