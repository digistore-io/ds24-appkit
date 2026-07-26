#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Reads .dev/dev.log and reports what actually went wrong while the app was
// running. The counterpart to `node run.mjs logs`: that one is for a human to
// watch, this one is for deciding whether the app is broken.
//
// Usage:
//   node run.mjs errors            (or: node scripts/dev/log-errors.mjs)
//
// Why this exists at all. `node run.mjs smoke` judges a page by its HTTP status,
// and there is a whole class of defect that never changes the status:
//
//   {format.dateTime(person.since, { dateStyle: "medium" })}
//
// If `person.since` is not a Date, Intl throws — but next-intl catches it,
// writes the error to stderr and renders `String(value)` instead. The page
// answers 200, the table cell reads "2026-07-25 11:29:17.552095", and every
// automated check in this project is happy. The log is the only witness.
//
// The same is true of a missing translation, a hydration mismatch, and an
// unhandled rejection in a server action: all visible in the log, none of them
// visible in a status code.
import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { LOG_FILE } from "./app-port.mjs";

/**
 * How large the log is right now.
 *
 * Take this BEFORE doing something to the app, pass it to findErrors()
 * afterwards, and you get the errors your own requests caused rather than
 * everything since the app started. That is how smoke.mjs uses it.
 */
export function markLog() {
  if (!existsSync(LOG_FILE)) return 0;
  return statSync(LOG_FILE).size;
}

/** The log from `fromOffset` on. Starts over if the file has been truncated. */
function readFrom(fromOffset) {
  if (!existsSync(LOG_FILE)) return "";
  const size = statSync(LOG_FILE).size;
  // `start` opens the log with "w", so a restart shrinks it. An offset from
  // before that restart points into nothing — read the lot instead.
  const from = size < fromOffset ? 0 : fromOffset;
  if (size === from) return "";

  const fd = openSync(LOG_FILE, "r");
  try {
    const buffer = Buffer.alloc(size - from);
    readSync(fd, buffer, 0, buffer.length, from);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * What starts an error in the log.
 *
 * Next writes an error as a block at column 0 — `Error: …`, sometimes with a
 * `⨯` in front — followed by an indented stack and a code frame. `[intl]` is
 * this project's own prefix from i18n/request.ts.
 */
const ERROR_START = [
  /^(?:⨯\s+)?(?:\[intl\]\s+)?\w*Error(?::|\b.*\bat\b)/,
  /^(?:⨯\s+)?(?:\[intl\]\s+)?unhandledRejection\b/,
  /^(?:⨯\s+)?(?:\[intl\]\s+)?Warning:.*hydrat/i,
  /^(?:⨯\s+)?.*\bHydration failed\b/,
  /^⨯\s+\S/,
];

/**
 * What is NOT an error, however loudly it is printed.
 *
 * The dev-login banner is the one that matters: it carries a ⚠️ and a
 * "no mail transport configured", and flagging it would make this command cry
 * wolf on every single fresh project.
 */
const BENIGN = [
  /^⚠️/,
  /^[✓○▲ℹ✗•-]/,
  /^\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/,
  /^\s*(?:Local|Network|Environments|Ready|Compiled|Compiling|Starting|Reload)\b/,
  /^\s*[▲✓]?\s*Next\.js\s/,
];

/** The named error codes worth pulling out of a message as the headline. */
const CODES = [
  "FORMATTING_ERROR",
  "MISSING_MESSAGE",
  "MISSING_FORMAT",
  "INSUFFICIENT_PATH",
  "INVALID_MESSAGE",
  "INVALID_KEY",
  "ENVIRONMENT_FALLBACK",
];

/**
 * What to do about it. The point of these is that the fix is almost never at
 * the line the stack trace names — that line is where the bad value surfaced,
 * not where it was made.
 */
const HINTS = [
  {
    when: /FORMATTING_ERROR.*Invalid time value/,
    say:
      "the value is not a Date. A raw sql`` expression and anything through JSON\n" +
      "    both hand you a string — see CLAUDE.md → Dates and raw SQL. Fix where the\n" +
      "    value is produced, not at the format.dateTime call.",
  },
  {
    when: /MISSING_MESSAGE/,
    say: "the key is missing in messages/de.json or messages/en.json — both need it.",
  },
  {
    when: /MISSING_FORMAT/,
    say: "the named format is not declared in i18n/request.ts → formats.",
  },
  {
    when: /hydrat/i,
    say:
      "server and browser rendered different markup. Usually a date, a random value\n" +
      "    or a `typeof window` check inside the render.",
  },
  {
    when: /unhandledRejection/,
    say: "a promise rejected with nobody awaiting it — add the await, or catch it.",
  },
  {
    when: /ECONNREFUSED|ENOTFOUND/,
    say: "something the app talks to is not answering — the database? Try: node run.mjs status",
  },
];

function isBenign(line) {
  return BENIGN.some((pattern) => pattern.test(line));
}

function isErrorStart(line) {
  if (!line.trim() || isBenign(line)) return false;
  return ERROR_START.some((pattern) => pattern.test(line));
}

/** The headline: a named code if there is one, else the first line as written. */
function headline(firstLine) {
  const clean = firstLine.replace(/^⨯\s+/, "").replace(/^\[intl\]\s+/, "").trim();
  const code = CODES.find((name) => clean.includes(name));
  if (!code) return clean;
  // "Error: FORMATTING_ERROR: Invalid time value" → "FORMATTING_ERROR: Invalid time value"
  return clean.slice(clean.indexOf(code));
}

/**
 * Every error in a piece of log text, deduped. Pure — log-errors.test.ts drives
 * this one directly with a captured log, so the patterns above can be tested
 * without a running app.
 *
 * A block is read with a bounded lookahead rather than by finding its exact
 * end: a code frame puts `>` and `}` at column 0, so "the block ends at the
 * next unindented line" would cut it in half. All that is needed from the
 * block is the first source location and the marked frame line.
 */
export function parseErrors(text) {
  const lines = text.split("\n");
  const findings = new Map();

  for (let index = 0; index < lines.length; index++) {
    if (!isErrorStart(lines[index])) continue;

    const block = [];
    for (let ahead = index + 1; ahead < lines.length && block.length < 25; ahead++) {
      if (isErrorStart(lines[ahead])) break;
      if (isBenign(lines[ahead])) break;
      block.push(lines[ahead]);
    }

    const message = headline(lines[index]);
    // The app's own files first: the top of a stack is often inside next/react,
    // and what the reader needs is the line they wrote.
    const own = block.find((line) => /\b(app|lib|components|hooks|db|i18n)\/\S+:\d+:\d+/.test(line));
    const any = block.find((line) => /\S+:\d+:\d+/.test(line));
    // No parentheses in the class: the stack writes `at X (app/…/page.tsx:174:35)`
    // and the opening bracket is not part of the path.
    const location = (own ?? any ?? "").match(/([\w./[\]@-]+:\d+):\d+/)?.[1] ?? null;
    // The line the code frame marks with `>` — the actual offending expression.
    const frame = block.find((line) => /^>\s*\d+\s*\|/.test(line))?.replace(/^>\s*\d+\s*\|\s*/, "").trim() ?? null;

    const key = `${message}@${location ?? "?"}`;
    const seen = findings.get(key);
    if (seen) seen.count += 1;
    else findings.set(key, { message, location, frame, count: 1 });
  }

  return [...findings.values()];
}

/** Every error in .dev/dev.log from `fromOffset` on. */
export function findErrors(fromOffset = 0) {
  return parseErrors(readFrom(fromOffset));
}

/** Prints the findings. Returns how many distinct ones there were. */
export function report(fromOffset = 0) {
  const findings = findErrors(fromOffset);

  if (!existsSync(LOG_FILE)) {
    console.log("The app has not run yet — no log. Start it: node run.mjs start");
    return 0;
  }

  if (findings.length === 0) {
    console.log("✓ No errors in the log.");
    return 0;
  }

  const total = findings.reduce((sum, finding) => sum + finding.count, 0);
  console.error(`✗ ${total} error(s) in the log — ${findings.length} distinct:\n`);

  for (const { message, location, frame, count } of findings) {
    console.error(`  ${message}${count > 1 ? `  (${count}×)` : ""}`);
    if (location) console.error(`    ${location}`);
    if (frame) console.error(`    ${frame}`);
    const hint = HINTS.find(({ when }) => when.test(message));
    if (hint) console.error(`    → ${hint.say}`);
    console.error("");
  }

  console.error(
    "A page that answers 200 can still be broken — this is what the status code\n" +
      "cannot tell you. Fix these before you report the work as done.\n" +
      "The full context, with stack traces: node run.mjs logs",
  );
  return findings.length;
}

/** `node run.mjs errors` — non-zero exit when the log holds errors. */
export function cli() {
  if (report() > 0) process.exitCode = 1;
}

// Runnable on its own, not only through run.mjs.
if (process.argv[1] && process.argv[1].endsWith("log-errors.mjs")) cli();
