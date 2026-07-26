// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Checks the assistant's handbook — format, size and what one answer costs.
//
//   node run.mjs kb-check
//
// Two jobs, and the second is the one you cannot get anywhere else:
//
//  1. **Format.** Every file under `content/knowledge/` against the rules in
//     `lib/ai/frontmatter.mjs`. `npm run test` fails on the same problems, but
//     it says "expected [] to equal [...]"; this says which file and which line.
//  2. **Money.** The handbook is sent to the model on every question, so its
//     size IS the running cost of the feature. The numbers below turn "the
//     handbook got a bit long" into a figure before the invoice does.
//
// Plain Node, no bundler, no TypeScript, no dependency — it has to run on
// Linux, macOS and in a Git Bash on Windows (CLAUDE.md, "Three systems").
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, sep } from "node:path";

import {
  KNOWLEDGE_SECTIONS,
  comparePaths,
  estimateTokens,
  validateDoc,
} from "../../lib/ai/frontmatter.mjs";
// The walk and the three budgets, from the one file the app reads them from.
// Both were copied here — the walk verbatim under a comment saying it "mirrors
// knowledge.ts", the warn threshold as a bare literal, and the MAXIMUM not at
// all, so this command never reported the one overrun the app flags.
import {
  KNOWLEDGE_MAX_CHARS,
  KNOWLEDGE_MIN_CHARS,
  KNOWLEDGE_WARN_CHARS,
  markdownFilesIn,
  renderedChars,
} from "../../lib/ai/knowledge-files.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const KNOWLEDGE = join(ROOT, "content", "knowledge");

/**
 * Indicative list prices per million tokens, so the estimate is a number and
 * not a shrug. Anthropic's published rates; check
 * https://platform.claude.com/docs/en/pricing before quoting them to anybody.
 *
 * A cache READ is about a tenth of the input price — that is the whole reason
 * the handbook is sent whole. A cache WRITE costs more than plain input
 * (1.25x for the 5-minute window, 2x for the hour), and it happens once per
 * window for the WHOLE installation, not once per customer.
 */
const PRICES = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** A typical answer, for the output half of the estimate. */
const ANSWER_TOKENS = 400;

function money(dollars) {
  if (dollars < 0.01) return `${(dollars * 100).toFixed(3)} cents`;
  return `$${dollars.toFixed(3)}`;
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "config", "ai-chat.json"), "utf8"));
  } catch {
    return {};
  }
}

// --- Read ---------------------------------------------------------------------

let exists = false;
try {
  exists = statSync(KNOWLEDGE).isDirectory();
} catch {
  exists = false;
}

if (!exists) {
  console.error(
    "✗ content/knowledge/ does not exist.\n" +
      "  The assistant has nothing to answer from. Start the skill:\n" +
      "  ask Claude Code for 'ai-chat-knowledge'.",
  );
  process.exit(1);
}

const docs = [];
const problems = [];

const scan = markdownFilesIn(KNOWLEDGE);
problems.push(...scan.problems);

for (const relative of scan.found) {
  let raw;
  try {
    raw = readFileSync(join(KNOWLEDGE, relative.split("/").join(sep)), "utf8");
  } catch (error) {
    problems.push({ path: relative, problem: `cannot be read: ${String(error)}` });
    continue;
  }
  const result = validateDoc(relative, raw);
  problems.push(...result.problems);
  if (result.doc) docs.push(result.doc);
}

docs.sort((a, b) => comparePaths(a.path, b.path));

// --- Report -------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`✗ ${problems.length} problem(s):\n`);
  for (const problem of problems) {
    console.error(`  content/knowledge/${problem.path}`);
    console.error(`    ${problem.problem}\n`);
  }
}

if (docs.length === 0) {
  console.error("✗ No usable document in content/knowledge/.");
  process.exit(1);
}

// What actually lands in the prompt: bodies alone under-report by roughly a
// quarter, because every document also carries a contents line and a fence.
const chars = renderedChars(docs);
const tokens = estimateTokens(chars);

console.log(`Handbook: ${docs.length} document(s), ${chars} characters, about ${tokens} tokens\n`);

for (const section of KNOWLEDGE_SECTIONS) {
  const inSection = docs.filter((doc) => doc.section === section);
  const mark = inSection.length === 0 ? "·" : "✓";
  console.log(`  ${mark} ${section.padEnd(11)} ${inSection.length}`);
  for (const doc of inSection) {
    console.log(`      ${doc.path} — ${doc.title}`);
  }
}

// An empty section is not an error — a product with nothing worth a glossary is
// a normal product. It is worth saying out loud, though, because the usual
// cause is that somebody stopped halfway through the skill.
const empty = KNOWLEDGE_SECTIONS.filter(
  (section) => !docs.some((doc) => doc.section === section),
);
if (empty.length > 0) {
  console.log(`\nℹ Nothing in: ${empty.join(", ")}. Fine if you meant it.`);
}

// --- What it costs ------------------------------------------------------------

const config = readConfig();
// Which model answers is a property of the `chat` TASK, not of the assistant —
// it moved to config/ai-models.json when the provider layer landed. Read from
// there so this estimate quotes the model that will actually run.
const models = JSON.parse(readFileSync(join(ROOT, "config", "ai-models.json"), "utf8"));
const model =
  models?.tasks?.chat?.model ?? models?.default?.model ?? "claude-sonnet-5";
const ttl = config.cacheTtl === "5m" ? "5m" : "1h";
const price = PRICES[model];

console.log("");
if (!price) {
  console.log(`ℹ No price on file for "${model}" — skipping the cost estimate.`);
} else {
  const writeMultiplier = ttl === "1h" ? 2 : 1.25;
  const perAnswer =
    (tokens / 1e6) * price.input * 0.1 + (ANSWER_TOKENS / 1e6) * price.output;
  const perWrite = (tokens / 1e6) * price.input * writeMultiplier;

  console.log(`Cost with ${model}, cache lifetime ${ttl} (list prices, indicative):`);
  console.log(`  one answer, handbook already cached   ~ ${money(perAnswer)}`);
  console.log(`  refreshing the cache, once per ${ttl}     ~ ${money(perWrite)}`);
  console.log(
    "  The refresh is per INSTALLATION, not per customer — the handbook is the\n" +
      "  same bytes for everybody, which is what makes this approach cheap.",
  );
}

if (chars < KNOWLEDGE_MIN_CHARS) {
  console.log(
    `\n⚠ The handbook is only ${chars} characters (about ${tokens} tokens).\n` +
      "  Below roughly 4,096 tokens some providers do not cache the prefix at\n" +
      "  all, and none of them says so — nothing extra is charged, but the\n" +
      "  discount above simply never happens and every answer pays full input\n" +
      "  price. It still works; it is not the cheap path this design assumes.\n" +
      "  See docs/ai-providers.md.",
  );
}

if (chars > KNOWLEDGE_WARN_CHARS) {
  console.log(
    `\n⚠ The handbook is over ${KNOWLEDGE_WARN_CHARS} characters. Still works, but every\n` +
      "  answer now carries it. Consider trimming, or read docs/ai-chat.md on\n" +
      "  swapping the retriever.",
  );
}

// The budget the app itself refuses at. It was flagged in `readKnowledgeFrom`
// and nowhere in this command — so the check an operator is told to run before
// shipping stayed silent about the one size that fails the build.
if (chars > KNOWLEDGE_MAX_CHARS) {
  console.error(
    `\n✗ The handbook is ${chars} characters and the budget is ${KNOWLEDGE_MAX_CHARS}.\n` +
      "  Past this it is not a prompt any more — swap the retriever instead of\n" +
      "  paying to cache a book. See docs/ai-chat.md.",
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error("\n✗ Fix the problems above, then run this again.");
  process.exit(1);
}

console.log("\n✓ The handbook is in order.");
