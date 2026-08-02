// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The guide has to know what the app can do.
//
// Whoever builds here is guided by an AI agent, and that agent knows exactly
// what the text in this project tells it: CLAUDE.md is loaded on every session,
// docs/ and .claude/skills/ are read when something points at them. A command,
// a skill or a config switch that appears in none of those does not exist as far
// as the agent is concerned — it will rebuild the feature by hand, or answer
// that the app cannot do it.
//
// That is the quiet half of the failure. The loud half is the opposite
// direction: a guide that names a skill or a doc which is no longer there sends
// the agent after a file it cannot open, and it says so to the user.
//
// So this test measures the guide against the inventory, in both directions:
//
//   1. every `node run.mjs` command is documented somewhere,
//   2. the skill list in CLAUDE.md is exactly what .claude/skills/ holds,
//   3. every docs/*.md is reachable from CLAUDE.md, the README or a skill,
//   4. no text points at a docs/ file that does not exist,
//   5. every config/*.json is named somewhere.
//
// It is the same kind of guard as scripts/portability.test.ts: it fails on a
// CLASS of mistake — "feature shipped, guide not touched" — rather than on an
// instance. Documentation drift cannot be caught by review, because the reviewer
// reads the diff, and the omission is precisely what is not in it.
//
// Not checked here: which pages ship under app/dashboard/ (that is
// scripts/session-start.test.ts, which needs it for the greeting).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const list = (dir: string, ext: string) =>
  readdirSync(path.join(ROOT, dir))
    .filter((entry) => entry.endsWith(ext))
    .sort();

// ── the inventory ───────────────────────────────────────────────────────────

/**
 * Every command `node run.mjs <name>` accepts.
 *
 * Read as text, not imported: run.mjs executes the command on import — that is
 * what the file is for. Each entry runs from its key to the next `\n  },` at
 * exactly two spaces of indent, so nested objects inside do not end it early.
 */
function commands(): string[] {
  const source = read("run.mjs");
  const table = source.slice(source.indexOf("const TASKS = {"));
  return [...table.matchAll(/^ {2}"?([a-z0-9_-]+)"?: \{([\s\S]*?)\n {2}\},/gm)]
    .filter(([, , body]) => !/hidden:\s*true/.test(body))
    .map(([, name]) => name)
    .sort();
}

const COMMANDS = commands();
const SKILLS = readdirSync(path.join(ROOT, ".claude/skills")).sort();
const DOCS = list("docs", ".md");
const CONFIGS = list("config", ".json");

/** Everything the agent can end up reading. The keys are for the error message. */
const CORPUS = new Map<string, string>([
  ["CLAUDE.md", read("CLAUDE.md")],
  ["README.md", read("README.md")],
  ...DOCS.map((file): [string, string] => [`docs/${file}`, read(`docs/${file}`)]),
  ...SKILLS.map((skill): [string, string] => [
    `.claude/skills/${skill}/SKILL.md`,
    read(`.claude/skills/${skill}/SKILL.md`),
  ]),
]);

const GUIDE = CORPUS.get("CLAUDE.md")!;
const EVERYWHERE = [...CORPUS.values()].join("\n");

// A parse that quietly stops matching would turn every check below green — the
// worst possible outcome for a test whose whole job is to notice omissions.
describe("the inventory is readable at all", () => {
  it("finds the commands, skills, docs and configs", () => {
    expect(COMMANDS.length, "no commands parsed out of run.mjs").toBeGreaterThan(30);
    expect(SKILLS.length).toBeGreaterThan(10);
    expect(DOCS.length).toBeGreaterThan(5);
    expect(CONFIGS.length).toBeGreaterThan(3);
  });
});

// ── 1. commands ─────────────────────────────────────────────────────────────

/**
 * Commands that need no prose, with the reason. Everything else has to be
 * written down somewhere.
 *
 * This list is the decision, not the exception: whoever adds a command either
 * documents it or explains here, in one line, why nobody ever needs to be told
 * about it. "I did not get around to it" is not one of the reasons.
 */
const SELF_EXPLANATORY = new Map([
  ["help", "prints the list of commands itself"],
  ["env", "prerequisite of start/setup, never typed by hand"],
  ["db-up", "prerequisite of start, never typed by hand"],
  ["db-down", "the counterpart of db-up, same reason"],
  ["dev", "start with the log in the terminal — the README documents start"],
  ["typecheck", "the guides name `npm run typecheck`, which is the same thing"],
  ["lint", "the guides name `npm run lint`, which is the same thing"],
]);

describe("every command is documented", () => {
  const undocumented = COMMANDS.filter(
    (name) =>
      !SELF_EXPLANATORY.has(name) &&
      // The form an agent copies into a terminal, not the bare word: "cron",
      // "setup" and "errors" appear in running prose on nearly every page.
      !new RegExp(`run\\.mjs ${name}(?![a-z0-9-])`).test(EVERYWHERE),
  );

  it("names each one in CLAUDE.md, the README, a doc or a skill", () => {
    expect(
      undocumented,
      `documented nowhere: ${undocumented.join(", ")} — write it into a doc, ` +
        `or add it to SELF_EXPLANATORY with the reason`,
    ).toEqual([]);
  });

  it("keeps no reason for a command that is gone", () => {
    const stale = [...SELF_EXPLANATORY.keys()].filter((name) => !COMMANDS.includes(name));
    expect(stale, `run.mjs no longer has: ${stale.join(", ")}`).toEqual([]);
  });
});

// ── 2. skills ───────────────────────────────────────────────────────────────

describe("the skill list in CLAUDE.md is the truth", () => {
  // The bullet list under "There are guided skills in `.claude/skills/`", cut out
  // by its two surrounding sentences: `- **`name`**` is the shape of a bullet in
  // this guide generally, and further down the same shape lists the two user
  // roles. The path summary between the two markers names the same skills in
  // plain backticks and is not matched — it is a second telling of the list,
  // not a second list.
  const OPENS = "There are guided skills in `.claude/skills/`";
  const CLOSES = "The complete path";
  const from = GUIDE.indexOf(OPENS);
  const to = GUIDE.indexOf(CLOSES);
  const block = from === -1 || to === -1 ? "" : GUIDE.slice(from, to);
  const listed = [...block.matchAll(/^- \*\*`([a-z0-9-]+)`\*\*/gm)].map((m) => m[1]).sort();

  it("finds the list in the form this test can read", () => {
    expect(from, `"${OPENS}" not found in CLAUDE.md`).not.toBe(-1);
    expect(to, `"${CLOSES}" not found in CLAUDE.md`).toBeGreaterThan(from);
    expect(listed.length, "no `- **`skill-name`**` bullets in that block").toBeGreaterThan(10);
  });

  it("lists exactly the skills that exist", () => {
    // Both directions matter. A missing entry hides a whole guided workflow from
    // the agent; a leftover entry makes it announce a skill it cannot start.
    // The fix for either is one bullet: `- **`skill-name`** — what it does.`
    expect(listed).toEqual(SKILLS);
  });
});

// ── 3. + 4. docs ────────────────────────────────────────────────────────────

// Top level only, deliberately: `docs/reports/security-2026-07-26.md` and its
// kind are dated output the gateways write, so neither their absence nor their
// number says anything about the guide.
const DOC_REF = /docs\/([a-zA-Z0-9._-]+\.md)/g;
const refsIn = (text: string) => [...text.matchAll(DOC_REF)].map((m) => m[1]);

/**
 * Docs that the customer's own work produces, not ones we ship. They are
 * missing in a fresh clone and that is correct — a skill writes them, and other
 * skills read them afterwards.
 *
 * The distinction is load-bearing in both directions: shipping one of these
 * would put our example text where the customer's own belongs, and treating a
 * shipped doc as generated would hide a broken link.
 */
const GENERATED = new Map([
  ["product-brief.md", "written by the skill market-research"],
  ["app.md", "this app's own notebook — created by build-app, grown per feature"],
  ["design.md", "this app's visual identity — written by the skill design"],
]);

describe("every doc can be found", () => {
  it("reaches each docs/*.md from CLAUDE.md, the README or a skill", () => {
    // A doc that only another unreferenced doc points at is unreachable too, so
    // this follows the links rather than just scanning everything at once.
    const roots = [...CORPUS].filter(([file]) => !file.startsWith("docs/"));
    const reached = new Set<string>();
    const queue = roots.flatMap(([, text]) => refsIn(text));
    while (queue.length > 0) {
      const file = queue.shift()!;
      if (reached.has(file)) continue;
      reached.add(file);
      const text = CORPUS.get(`docs/${file}`);
      if (text) queue.push(...refsIn(text));
    }

    const orphans = DOCS.filter((file) => !reached.has(file));
    expect(
      orphans,
      `nothing points at: ${orphans.map((f) => `docs/${f}`).join(", ")} — an agent ` +
        `never opens a file it was not told about. Mention it where it belongs ` +
        `(CLAUDE.md, or the doc/skill it goes with)`,
    ).toEqual([]);
  });

  it("points at no doc that does not exist", () => {
    // The same mistake as an assistant citing a handbook page nobody can open —
    // except here the agent quotes it to the person paying for the app.
    const dangling = [...CORPUS]
      .flatMap(([file, text]) => refsIn(text).map((ref) => ({ file, ref })))
      .filter(({ ref }) => !DOCS.includes(ref) && !GENERATED.has(ref));
    expect(
      dangling.map(({ file, ref }) => `${file} → docs/${ref}`),
      "these links lead nowhere",
    ).toEqual([]);
  });

  // No "ships no doc it declares as generated" test here, deliberately: that
  // invariant only holds for the PRISTINE template, before any app was built.
  // `docs/app.md` existing is `build-app` having done its job, not a defect —
  // an app that follows the golden path must not fail a check written against
  // the state it is supposed to leave behind. (A field-test session had to
  // delete this test mid-build; this comment is what keeps it deleted.)
  // GENERATED keeps its other job above: a link to `docs/app.md` from
  // CLAUDE.md is not flagged as dangling on a fresh clone.
});

// ── 5. config ───────────────────────────────────────────────────────────────

describe("every config file is named somewhere", () => {
  it("explains each config/*.json", () => {
    // These are the product's switches. One that no text mentions is a feature
    // the operator owns and the agent cannot find — it will build a second
    // switch of its own beside it.
    const unexplained = CONFIGS.filter((file) => !EVERYWHERE.includes(`config/${file}`));
    expect(unexplained, `not named anywhere: ${unexplained.join(", ")}`).toEqual([]);
  });
});
